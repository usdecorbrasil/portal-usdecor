'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import { lerDocumento, TIPOS_DOCUMENTO, type DocumentoLido } from '@/lib/despesas/ler-documento'

/**
 * Despesas por documento (nota, cupom, recibo) — só admin/financeiro.
 *
 * Fluxo: `lerDespesa` recebe o arquivo já comprimido, guarda no bucket
 * `despesas` e pede a leitura à IA; a tela de conferência mostra tudo
 * editável; `salvarDespesa` grava documento + itens. Item com suprimento vira
 * entrada no estoque pelo gatilho do banco.
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
  arquivoPath: string
  origem: 'camera' | 'upload'
  modo: 'manual' | 'ia'
  documento: DocumentoLido | null
  erroLeitura: string | null
}

/**
 * Guarda o arquivo e tenta a leitura por IA. Mesmo quando a IA falha, o
 * arquivo fica salvo e a tela abre em branco para preencher à mão.
 */
export async function lerDespesa(form: FormData): Promise<Resultado<{ rascunho: Rascunho }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }

  const arquivo = form.get('arquivo')
  const origem = form.get('origem') === 'camera' ? 'camera' : 'upload'
  const usarIa = form.get('ia') !== 'nao'
  if (!(arquivo instanceof File)) return { ok: false, erro: 'Escolha a foto ou o arquivo da nota.' }
  if (arquivo.size === 0) return { ok: false, erro: 'Arquivo vazio.' }
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: 'Arquivo acima de 10 MB. Tire a foto de novo ou reduza o PDF.' }
  const mediaType = arquivo.type as (typeof TIPOS_ARQUIVO)[number]
  if (!TIPOS_ARQUIVO.includes(mediaType)) return { ok: false, erro: 'Só JPG, PNG, WebP ou PDF.' }

  const conteudo = Buffer.from(await arquivo.arrayBuffer())
  const extensao = mediaType === 'application/pdf' ? 'pdf' : mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extensao}`

  const admin = createAdminClient()
  const { error: erroUpload } = await admin.storage.from(BUCKET).upload(caminho, conteudo, { contentType: mediaType })
  if (erroUpload) return { ok: false, erro: `Não deu para guardar o arquivo: ${erroUpload.message}` }

  if (!usarIa) {
    return { ok: true, rascunho: { arquivoPath: caminho, origem, modo: 'manual', documento: null, erroLeitura: null } }
  }

  const supabase = await createClient()
  const [{ data: categorias }, { data: suprimentos }] = await Promise.all([
    supabase.from('categorias_despesa').select('nome').eq('ativo', true).order('nome'),
    supabase.from('suprimentos').select('nome, unidade').eq('ativo', true).order('nome'),
  ])

  const leitura = await lerDocumento({
    conteudo,
    mediaType,
    categorias: (categorias ?? []).map((c) => c.nome as string),
    suprimentos: (suprimentos ?? []).map((s) => `${s.nome} (${s.unidade})`),
  })

  return {
    ok: true,
    rascunho: {
      arquivoPath: caminho,
      origem,
      modo: leitura.ok ? 'ia' : 'manual',
      documento: leitura.ok ? leitura.documento : null,
      erroLeitura: leitura.ok ? null : leitura.erro,
    },
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
  tipo: z.enum(TIPOS_DOCUMENTO),
  fornecedorNome: z.string().trim().max(200).nullable().optional(),
  fornecedorDoc: z.string().trim().max(20).nullable().optional(),
  numero: z.string().trim().max(40).nullable().optional(),
  serie: z.string().trim().max(10).nullable().optional(),
  chaveAcesso: z.string().trim().max(44).nullable().optional(),
  emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de emissão'),
  formaPagamento: z.string().trim().max(60).nullable().optional(),
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

export async function salvarDespesa(dados: DadosDespesa): Promise<Resultado<{ id: string }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaDespesa.safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data

  const chave = soDigitos(d.chaveAcesso)
  if (chave && chave.length !== 44) return { ok: false, erro: 'A chave de acesso tem 44 dígitos.' }

  const supabase = await createClient()
  const { data: despesa, error } = await supabase
    .from('despesas')
    .insert({
      tipo: d.tipo,
      fornecedor_nome: d.fornecedorNome || null,
      fornecedor_doc: soDigitos(d.fornecedorDoc),
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
    // Sem os itens a despesa não vale: tira o cabeçalho para não ficar pela metade
    await createAdminClient().from('despesas').delete().eq('id', despesa.id)
    return { ok: false, erro: erroItens.message }
  }

  await registrar({
    entidade: 'despesa',
    entidadeId: despesa.id,
    acao: 'criou',
    campos: [
      { campo: 'Fornecedor', de: null, para: d.fornecedorNome ?? null },
      { campo: 'Total', de: null, para: String(d.total) },
      { campo: 'Modo', de: null, para: d.modo === 'ia' ? 'lida por IA e conferida' : 'digitada' },
    ],
  })

  revalidar()
  return { ok: true, id: despesa.id }
}

export async function excluirDespesa(id: string, motivo: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_excluir_despesa', { p_despesa_id: id, p_motivo: motivo })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'despesa', entidadeId: id, acao: 'excluiu', campos: [], motivo })
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
