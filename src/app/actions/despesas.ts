'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import { lerDocumento, TIPOS_DOCUMENTO, type DocumentoLido, type ModeloLeitura } from '@/lib/despesas/ler-documento'
import { cnpjCpfValido, chaveAcessoValida } from '@/lib/despesas/validar'
import { aplicarCustosAutomaticos } from '@/lib/custos/compras'
import { CONDICOES, quitadaNaCompra, validarParcelas, ROTULO_CURTO } from '@/lib/contas-pagar/condicoes'

/**
 * Despesas por documento (nota, cupom, recibo) — só admin/financeiro.
 *
 * Fluxo: `lerDespesa` recebe o arquivo já comprimido, guarda no bucket
 * `despesas` e pede a leitura à IA; a tela de conferência mostra tudo
 * editável; `salvarDespesa` grava documento, contas a pagar e itens. Item com
 * suprimento vira entrada no estoque pelo gatilho do banco.
 */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

const BUCKET = 'despesas'
const TAMANHO_MAXIMO = 10 * 1024 * 1024
const TIPOS_ARQUIVO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

async function exigirAdmin() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro') ? perfil : null
}

function revalidar() {
  revalidatePath('/admin/estoque/despesas')
  revalidatePath('/admin/estoque/suprimentos')
}

/* ------------------------------- leitura ------------------------------- */

export type Rascunho = {
  /** Nulo quando a nota é lançada sem foto/PDF (permitido, com lembrete na tela). */
  arquivoPath: string | null
  origem: 'camera' | 'upload'
  modo: 'manual' | 'ia'
  /** Modelo que fez a leitura (rapido | preciso), quando houve. */
  modelo: ModeloLeitura | null
  documento: DocumentoLido | null
  erroLeitura: string | null
}

async function lerComIa(conteudo: Buffer, mediaType: (typeof TIPOS_ARQUIVO)[number], modelo: ModeloLeitura) {
  const supabase = await createClient()
  const [{ data: categorias }, { data: suprimentos }] = await Promise.all([
    supabase.from('categorias_despesa').select('nome').eq('ativo', true).order('nome'),
    supabase.from('suprimentos').select('nome, unidade').eq('ativo', true).order('nome'),
  ])
  return lerDocumento({
    conteudo,
    mediaType,
    modelo,
    categorias: (categorias ?? []).map((c) => c.nome as string),
    suprimentos: (suprimentos ?? []).map((s) => `${s.nome} (${s.unidade})`),
  })
}

/** Sobe o arquivo (já comprimido no aparelho) para o bucket privado. */
async function guardarArquivo(conteudo: Buffer, mediaType: (typeof TIPOS_ARQUIVO)[number]): Promise<Resultado<{ caminho: string }>> {
  const extensao = mediaType === 'application/pdf' ? 'pdf' : mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extensao}`
  const { error } = await createAdminClient().storage.from(BUCKET).upload(caminho, conteudo, { contentType: mediaType })
  if (error) return { ok: false, erro: `Não deu para guardar o arquivo: ${error.message}` }
  return { ok: true, caminho }
}

/** Valida o arquivo vindo do formulário (campo "arquivo"). */
function arquivoDoForm(form: FormData): Resultado<{ arquivo: File; mediaType: (typeof TIPOS_ARQUIVO)[number] }> {
  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File)) return { ok: false, erro: 'Escolha a foto ou o arquivo da nota.' }
  if (arquivo.size === 0) return { ok: false, erro: 'Arquivo vazio.' }
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: 'Arquivo acima de 10 MB. Tire a foto de novo ou reduza o PDF.' }
  const mediaType = arquivo.type as (typeof TIPOS_ARQUIVO)[number]
  if (!TIPOS_ARQUIVO.includes(mediaType)) return { ok: false, erro: 'Só JPG, PNG, WebP ou PDF.' }
  return { ok: true, arquivo, mediaType }
}

/**
 * Comprovante enviado depois, para nota lançada sem foto/PDF. O banco só
 * aceita quando a nota ainda está sem arquivo.
 */
export async function anexarComprovanteDespesa(despesaId: string, form: FormData): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  if (!z.string().uuid().safeParse(despesaId).success) return { ok: false, erro: 'Nota inválida.' }
  const a = arquivoDoForm(form)
  if (!a.ok) return a
  const guardado = await guardarArquivo(Buffer.from(await a.arquivo.arrayBuffer()), a.mediaType)
  if (!guardado.ok) return guardado

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_anexar_arquivo_despesa', { p_despesa_id: despesaId, p_arquivo_path: guardado.caminho })
  if (error) {
    // Não ficou ligado a nada: tira do bucket para não sobrar arquivo órfão
    await createAdminClient().storage.from(BUCKET).remove([guardado.caminho])
    return { ok: false, erro: error.message }
  }
  await registrar({
    entidade: 'despesa',
    entidadeId: despesaId,
    acao: 'editou',
    campos: [{ campo: 'Comprovante', de: 'sem arquivo', para: 'foto/PDF anexado' }],
  })
  revalidar()
  revalidatePath('/admin/financeiro/a-pagar')
  revalidatePath('/admin/dashboard')
  return { ok: true }
}

/**
 * Guarda o arquivo e tenta a leitura por IA. Mesmo quando a IA falha, o
 * arquivo fica salvo e a tela abre em branco para preencher à mão.
 */
export async function lerDespesa(form: FormData): Promise<Resultado<{ rascunho: Rascunho }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }

  const origem = form.get('origem') === 'camera' ? 'camera' : 'upload'
  const usarIa = form.get('ia') !== 'nao'
  const modelo: ModeloLeitura = form.get('modelo') === 'preciso' ? 'preciso' : 'rapido'
  const a = arquivoDoForm(form)
  if (!a.ok) return a
  const { arquivo, mediaType } = a

  const conteudo = Buffer.from(await arquivo.arrayBuffer())
  const guardado = await guardarArquivo(conteudo, mediaType)
  if (!guardado.ok) return guardado
  const caminho = guardado.caminho

  if (!usarIa) {
    return { ok: true, rascunho: { arquivoPath: caminho, origem, modo: 'manual', modelo: null, documento: null, erroLeitura: null } }
  }

  const leitura = await lerComIa(conteudo, mediaType, modelo)

  return {
    ok: true,
    rascunho: {
      arquivoPath: caminho,
      origem,
      modo: leitura.ok ? 'ia' : 'manual',
      modelo: leitura.ok ? leitura.modelo : null,
      documento: leitura.ok ? leitura.documento : null,
      erroLeitura: leitura.ok ? null : leitura.erro,
    },
  }
}

/**
 * Relê um arquivo já guardado com outro modelo (normalmente o preciso,
 * quando o rápido não entendeu). Não sobe nada de novo.
 */
export async function relerDespesa(arquivoPath: string, modelo: ModeloLeitura): Promise<Resultado<{ rascunho: Rascunho }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(arquivoPath)) return { ok: false, erro: 'Arquivo inválido.' }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).download(arquivoPath)
  if (error || !data) return { ok: false, erro: 'Arquivo não encontrado. Envie a nota de novo.' }

  const extensao = arquivoPath.slice(arquivoPath.lastIndexOf('.') + 1)
  const mediaType = (extensao === 'pdf' ? 'application/pdf' : extensao === 'png' ? 'image/png' : extensao === 'webp' ? 'image/webp' : 'image/jpeg') as (typeof TIPOS_ARQUIVO)[number]
  const leitura = await lerComIa(Buffer.from(await data.arrayBuffer()), mediaType, modelo)
  if (!leitura.ok) return { ok: false, erro: leitura.erro }

  return {
    ok: true,
    rascunho: { arquivoPath, origem: 'upload', modo: 'ia', modelo: leitura.modelo, documento: leitura.documento, erroLeitura: null },
  }
}

/* -------------------------------- gravar -------------------------------- */

const schemaItem = z.object({
  descricao: z.string().trim().min(1, 'Item sem descrição').max(300),
  codigo: z.string().trim().max(60).nullable().optional(),
  quantidade: z.number().positive('Quantidade do item precisa ser maior que zero').max(1_000_000),
  unidade: z.string().trim().max(10).nullable().optional(),
  valorUnitario: z.number().min(0).nullable().optional(),
  valorTotal: z.number().min(0),
  categoriaId: z.string().uuid().nullable().optional(),
  suprimentoId: z.string().uuid().nullable().optional(),
  confianca: z.number().min(0).max(1).nullable().optional(),
})

const schemaDespesa = z.object({
  arquivoPath: z.string().min(1).nullable(),
  origem: z.enum(['camera', 'upload']),
  modo: z.enum(['manual', 'ia']),
  modeloIa: z.enum(['rapido', 'preciso']).nullable().optional(),
  tipo: z.enum(TIPOS_DOCUMENTO),
  fornecedorNome: z.string().trim().max(200).nullable().optional(),
  fornecedorDoc: z.string().trim().max(20).nullable().optional(),
  numero: z.string().trim().max(40).nullable().optional(),
  serie: z.string().trim().max(10).nullable().optional(),
  chaveAcesso: z.string().trim().max(44).nullable().optional(),
  emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de emissão'),
  formaPagamento: z.string().trim().max(60).nullable().optional(),
  condicao: z.enum(CONDICOES, { message: 'Escolha como a nota foi paga' }),
  parcelas: z
    .array(z.object({ vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.number().positive() }))
    .max(36)
    .default([]),
  subtotal: z.number().min(0).nullable().optional(),
  desconto: z.number().min(0).default(0),
  frete: z.number().min(0).default(0),
  impostos: z.number().min(0).default(0),
  total: z.number().positive('Informe o valor total'),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  confianca: z.record(z.string(), z.number()).nullable().optional(),
  itens: z.array(schemaItem).min(1, 'A nota precisa ter ao menos um item').max(200),
})

export type DadosDespesa = z.input<typeof schemaDespesa>

function soDigitos(v: string | null | undefined) {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length ? d : null
}

export async function salvarDespesa(dados: DadosDespesa): Promise<Resultado<{ id: string; avisoCustos: string | null }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaDespesa.safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data

  const chave = soDigitos(d.chaveAcesso)
  if (chave && !chaveAcessoValida(chave)) return { ok: false, erro: 'Chave de acesso inválida: confira os 44 dígitos com o documento.' }
  const docFornecedor = soDigitos(d.fornecedorDoc)
  if (docFornecedor && !cnpjCpfValido(docFornecedor)) return { ok: false, erro: 'CNPJ/CPF do fornecedor inválido: confira os dígitos com o documento.' }

  if (!quitadaNaCompra(d.condicao)) {
    const erroParcelas = validarParcelas(d.parcelas, d.total)
    if (erroParcelas) return { ok: false, erro: erroParcelas }
  }

  const supabase = await createClient()
  const { data: despesa, error } = await supabase
    .from('despesas')
    .insert({
      tipo: d.tipo,
      fornecedor_nome: d.fornecedorNome || null,
      fornecedor_doc: docFornecedor,
      numero: d.numero || null,
      serie: d.serie || null,
      chave_acesso: chave,
      emissao: d.emissao,
      forma_pagamento: d.formaPagamento || null,
      subtotal: d.subtotal ?? null,
      desconto: d.desconto,
      frete: d.frete,
      impostos: d.impostos,
      total: d.total,
      arquivo_path: d.arquivoPath,
      origem: d.origem,
      modo: d.modo,
      modelo_ia: d.modo === 'ia' ? d.modeloIa ?? null : null,
      confianca: d.confianca ?? null,
      observacoes: d.observacoes || null,
      criado_por: perfil.id,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Esta nota já foi lançada (mesma chave de acesso).' }
    return { ok: false, erro: error.message }
  }

  // Contas a pagar antes dos itens: se falharem, a nota sai inteira sem ter
  // mexido no estoque (os itens com suprimento geram entrada por gatilho).
  // A categoria da conta é a do item de maior valor.
  const categoriaConta =
    [...d.itens].filter((i) => i.categoriaId).sort((a, b) => b.valorTotal - a.valorTotal)[0]?.categoriaId ?? null
  const { error: erroContas } = await supabase.rpc('admin_gerar_contas_despesa', {
    p_despesa_id: despesa.id,
    p_condicao: d.condicao,
    p_parcelas: quitadaNaCompra(d.condicao) ? null : d.parcelas,
    p_categoria_id: categoriaConta,
  })
  if (erroContas) {
    await createAdminClient().from('despesas').delete().eq('id', despesa.id)
    return { ok: false, erro: erroContas.message }
  }

  const { error: erroItens } = await supabase.from('despesa_itens').insert(
    d.itens.map((i, idx) => ({
      despesa_id: despesa.id,
      linha: idx + 1,
      descricao: i.descricao,
      codigo: i.codigo || null,
      quantidade: i.quantidade,
      unidade: i.unidade || null,
      valor_unitario: i.valorUnitario ?? null,
      valor_total: i.valorTotal,
      categoria_id: i.categoriaId ?? null,
      suprimento_id: i.suprimentoId ?? null,
      confianca: i.confianca ?? null,
    }))
  )
  if (erroItens) {
    // Sem os itens a despesa não vale: tira o cabeçalho (e, em cascata, as
    // contas a pagar) para não ficar pela metade
    await createAdminClient().from('despesas').delete().eq('id', despesa.id)
    return { ok: false, erro: erroItens.message }
  }

  // Compra de suprimento pode mexer no custo por metro, se a opção estiver
  // ligada em Financeiro → Custos. Nunca derruba o lançamento da nota
  const avisoCustos = d.itens.some((i) => i.suprimentoId) ? await aplicarCustosAutomaticos(supabase) : null

  await registrar({
    entidade: 'despesa',
    entidadeId: despesa.id,
    acao: 'criou',
    campos: [
      { campo: 'Fornecedor', de: null, para: d.fornecedorNome ?? null },
      { campo: 'Total', de: null, para: String(d.total) },
      { campo: 'Comprovante', de: null, para: d.arquivoPath ? 'foto/PDF anexado' : 'sem arquivo' },
      {
        campo: 'Pagamento',
        de: null,
        para: quitadaNaCompra(d.condicao) ? ROTULO_CURTO[d.condicao] : `${ROTULO_CURTO[d.condicao]} · ${d.parcelas.length}x`,
      },
      { campo: 'Modo', de: null, para: d.modo === 'ia' ? `lida por IA (${d.modeloIa ?? 'rapido'}) e conferida` : 'digitada' },
    ],
  })

  revalidar()
  revalidatePath('/admin/financeiro/a-pagar')
  if (avisoCustos) revalidatePath('/admin/financeiro/custos')
  return { ok: true, id: despesa.id, avisoCustos }
}

export async function excluirDespesa(id: string, motivo: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_excluir_despesa', { p_despesa_id: id, p_motivo: motivo })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'despesa', entidadeId: id, acao: 'excluiu', campos: [], motivo })
  revalidatePath('/admin/financeiro/a-pagar')
  revalidar()
  return { ok: true }
}

export async function criarCategoriaDespesa(nome: string): Promise<Resultado<{ id: string }>> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const n = nome.trim()
  if (n.length < 2) return { ok: false, erro: 'Nome da categoria muito curto.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('categorias_despesa').insert({ nome: n }).select('id').single()
  if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe uma categoria com esse nome.' : error.message }
  revalidar()
  return { ok: true, id: data.id }
}

/* --------------------------------- ler --------------------------------- */

export type DespesaLinha = {
  id: string
  tipo: string
  fornecedor: string | null
  numero: string | null
  emissao: string
  total: number
  modo: string
  arquivoUrl: string | null
  observacoes: string | null
  itens: {
    descricao: string
    quantidade: number
    unidade: string | null
    valorTotal: number
    categoria: string | null
    suprimento: string | null
  }[]
}

export type ResumoDespesas = {
  de: string
  ate: string
  total: number
  documentos: number
  porCategoria: { categoria: string; total: number; itens: number }[]
  porFornecedor: { fornecedor: string; total: number; documentos: number }[]
  linhas: DespesaLinha[]
}

export async function listarDespesas(filtros: { de: string; ate: string; categoriaId?: string }): Promise<ResumoDespesas | null> {
  if (!(await exigirAdmin())) return null
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('despesas')
    .select(
      'id, tipo, fornecedor_nome, numero, emissao, total, modo, arquivo_path, observacoes, ' +
        'despesa_itens(descricao, quantidade, unidade, valor_total, categoria_id, categorias_despesa(nome), suprimentos(nome))'
    )
    .is('excluido_em', null)
    .gte('emissao', filtros.de)
    .lte('emissao', filtros.ate)
    .order('emissao', { ascending: false })
  if (error) throw new Error(`Falha ao listar despesas: ${error.message}`)

  const admin = createAdminClient()
  const linhas: DespesaLinha[] = []
  for (const d of (data ?? []) as any[]) {
    const itens = ((d.despesa_itens ?? []) as any[]).filter(
      (i) => !filtros.categoriaId || i.categoria_id === filtros.categoriaId
    )
    if (filtros.categoriaId && itens.length === 0) continue
    const url = d.arquivo_path
      ? (await admin.storage.from(BUCKET).createSignedUrl(d.arquivo_path, 3600)).data?.signedUrl ?? null
      : null
    linhas.push({
      id: d.id,
      tipo: d.tipo,
      fornecedor: d.fornecedor_nome ?? null,
      numero: d.numero ?? null,
      emissao: String(d.emissao).slice(0, 10),
      total: Number(d.total),
      modo: d.modo,
      arquivoUrl: url,
      observacoes: d.observacoes ?? null,
      itens: itens.map((i) => ({
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        unidade: i.unidade ?? null,
        valorTotal: Number(i.valor_total),
        categoria: i.categorias_despesa?.nome ?? null,
        suprimento: i.suprimentos?.nome ?? null,
      })),
    })
  }

  const porCategoria = new Map<string, { total: number; itens: number }>()
  const porFornecedor = new Map<string, { total: number; documentos: number }>()
  for (const l of linhas) {
    for (const i of l.itens) {
      const k = i.categoria ?? 'Sem categoria'
      const g = porCategoria.get(k) ?? { total: 0, itens: 0 }
      g.total += i.valorTotal
      g.itens += 1
      porCategoria.set(k, g)
    }
    const f = l.fornecedor ?? 'Sem fornecedor'
    const g = porFornecedor.get(f) ?? { total: 0, documentos: 0 }
    g.total += filtros.categoriaId ? l.itens.reduce((s, i) => s + i.valorTotal, 0) : l.total
    g.documentos += 1
    porFornecedor.set(f, g)
  }

  return {
    de: filtros.de,
    ate: filtros.ate,
    total: filtros.categoriaId
      ? linhas.reduce((s, l) => s + l.itens.reduce((a, i) => a + i.valorTotal, 0), 0)
      : linhas.reduce((s, l) => s + l.total, 0),
    documentos: linhas.length,
    porCategoria: [...porCategoria].map(([categoria, g]) => ({ categoria, ...g })).sort((a, b) => b.total - a.total),
    porFornecedor: [...porFornecedor].map(([fornecedor, g]) => ({ fornecedor, ...g })).sort((a, b) => b.total - a.total),
    linhas,
  }
}
