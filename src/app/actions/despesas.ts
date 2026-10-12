'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import { lerDocumento, TIPOS_DOCUMENTO, VERSAO_PROMPT, type DocumentoLido, type ModeloLeitura } from '@/lib/despesas/ler-documento'
import { cnpjCpfValido, chaveAcessoValida } from '@/lib/despesas/validar'
import { corrigirPelaChave, divergenciasDaChave } from '@/lib/despesas/chave'
import { problemasDaLeitura, avisoDaEmissao } from '@/lib/despesas/conferir'
import { lerXmlNfe } from '@/lib/despesas/xml-nfe'
import { hojeBrasilia } from '@/lib/datas'
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
/** XML da NF-e: os navegadores mandam com um destes tipos (ou nenhum, no celular). */
const TIPOS_XML = ['text/xml', 'application/xml', ''] as const

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
  modo: 'manual' | 'ia' | 'xml'
  /** Modelo que fez a leitura (rapido | preciso), quando houve. */
  modelo: ModeloLeitura | null
  documento: DocumentoLido | null
  erroLeitura: string | null
  /** Campos que a chave de acesso corrigiu na leitura (ex.: "CNPJ/CPF do fornecedor"). */
  ajustes?: string[]
  /** Quando o rápido errou o que dá para provar e o preciso releu sozinho: por quê. */
  releitura?: string[] | null
  /** Como a IA devolveu, antes de qualquer correção — fica gravado para medir o acerto. */
  leituraOriginal?: DocumentoLido | null
}

/** Tecidos cadastrados e clientes ativos: a leitura usa para reconhecer nota de tecido de cliente. */
async function cadastroTecidos(): Promise<{ tecidos: string[]; clientes: { nome: string; doc: string | null }[] }> {
  const supabase = await createClient()
  const [{ data: tecidos }, { data: clientes }] = await Promise.all([
    supabase.from('tecidos').select('nome').eq('ativo', true).order('nome'),
    supabase.from('clientes').select('razao_social, cnpj').eq('ativo', true).is('arquivado', false).order('razao_social'),
  ])
  return {
    tecidos: (tecidos ?? []).map((t) => t.nome as string),
    clientes: (clientes ?? []).map((c) => ({ nome: c.razao_social as string, doc: String(c.cnpj ?? '').replace(/\D/g, '') || null })),
  }
}

async function lerComIa(
  conteudo: Buffer,
  mediaType: (typeof TIPOS_ARQUIVO)[number],
  modelo: ModeloLeitura,
  esforco?: 'low' | 'medium' | 'high'
) {
  const supabase = await createClient()
  const [{ data: categorias }, { data: suprimentos }, cadastro] = await Promise.all([
    supabase.from('categorias_despesa').select('nome').eq('ativo', true).order('nome'),
    supabase.from('suprimentos').select('nome, unidade').eq('ativo', true).order('nome'),
    cadastroTecidos(),
  ])
  return lerDocumento({
    conteudo,
    mediaType,
    modelo,
    esforco,
    categorias: (categorias ?? []).map((c) => c.nome as string),
    suprimentos: (suprimentos ?? []).map((s) => `${s.nome} (${s.unidade})`),
    tecidos: cadastro.tecidos,
    clientes: cadastro.clientes,
  })
}

/** Aplica à leitura o que a chave de acesso diz com certeza (emitente, número, série, tipo). */
function conferirPelaChave(d: DocumentoLido): { documento: DocumentoLido; ajustes: string[] } {
  const { campos, ajustes } = corrigirPelaChave(
    { tipo: d.tipo, fornecedorDoc: d.fornecedor_doc ?? '', numero: d.numero ?? '', serie: d.serie ?? '', emissao: d.emissao ?? '' },
    d.chave_acesso
  )
  if (!ajustes.length && campos.numero === (d.numero ?? '') && campos.serie === (d.serie ?? '')) return { documento: d, ajustes }
  return {
    documento: {
      ...d,
      tipo: campos.tipo as DocumentoLido['tipo'],
      fornecedor_doc: campos.fornecedorDoc || null,
      numero: campos.numero || null,
      serie: campos.serie || null,
    },
    ajustes,
  }
}

/**
 * Lê com o modelo pedido e confere. Se o rápido errou algo que dá para
 * provar (dígito de CNPJ ou chave, soma que não fecha, total ausente), relê
 * uma vez com o preciso em esforço médio e fica com a leitura de menos
 * problemas. O custo extra só aparece nas notas difíceis.
 */
async function lerEConferir(
  conteudo: Buffer,
  mediaType: (typeof TIPOS_ARQUIVO)[number],
  modelo: ModeloLeitura
): Promise<
  | { ok: true; documento: DocumentoLido; original: DocumentoLido; modelo: ModeloLeitura; ajustes: string[]; releitura: string[] | null }
  | { ok: false; erro: string }
> {
  const primeira = await lerComIa(conteudo, mediaType, modelo)
  if (!primeira.ok) return primeira
  const p1 = conferirPelaChave(primeira.documento)
  const problemas = problemasDaLeitura(p1.documento)
  const resultado = { ok: true as const, documento: p1.documento, original: primeira.documento, modelo, ajustes: p1.ajustes, releitura: null as string[] | null }
  if (modelo !== 'rapido' || !problemas.length) return resultado

  const segunda = await lerComIa(conteudo, mediaType, 'preciso', 'medium')
  if (!segunda.ok) return resultado
  const p2 = conferirPelaChave(segunda.documento)
  if (problemasDaLeitura(p2.documento).length > problemas.length) return { ...resultado, releitura: problemas }
  return { ok: true, documento: p2.documento, original: segunda.documento, modelo: 'preciso', ajustes: p2.ajustes, releitura: problemas }
}

/** Sobe o arquivo (já comprimido no aparelho) para o bucket privado. */
async function guardarArquivo(conteudo: Buffer, mediaType: (typeof TIPOS_ARQUIVO)[number] | 'text/xml'): Promise<Resultado<{ caminho: string }>> {
  const extensao = mediaType === 'application/pdf' ? 'pdf' : mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : mediaType === 'text/xml' ? 'xml' : 'jpg'
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
 * XML da NF-e: lido no servidor, sem IA e sem custo. Os dados vêm exatos do
 * documento assinado, então a conferência abre toda preenchida com
 * confiança 1. O XML fica guardado como o comprovante da nota.
 */
export async function importarXmlNfe(form: FormData): Promise<Resultado<{ rascunho: Rascunho }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }

  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: 'Escolha o arquivo XML da nota.' }
  if (arquivo.size > 2 * 1024 * 1024) return { ok: false, erro: 'XML acima de 2 MB — não parece ser uma NF-e.' }
  if (!/\.xml$/i.test(arquivo.name) && !(TIPOS_XML as readonly string[]).includes(arquivo.type)) {
    return { ok: false, erro: 'O arquivo precisa ser o XML da NF-e (.xml).' }
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer())
  const leitura = lerXmlNfe(conteudo.toString('utf8'), await cadastroTecidos())
  if (!leitura.ok) return { ok: false, erro: leitura.erro }

  const guardado = await guardarArquivo(conteudo, 'text/xml')
  if (!guardado.ok) return guardado

  const { documento, ajustes } = conferirPelaChave(leitura.documento)
  return {
    ok: true,
    rascunho: { arquivoPath: guardado.caminho, origem: 'upload', modo: 'xml', modelo: null, documento, erroLeitura: null, ajustes },
  }
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

  const leitura = await lerEConferir(conteudo, mediaType, modelo)

  return {
    ok: true,
    rascunho: leitura.ok
      ? {
          arquivoPath: caminho,
          origem,
          modo: 'ia',
          modelo: leitura.modelo,
          documento: leitura.documento,
          erroLeitura: null,
          ajustes: leitura.ajustes,
          releitura: leitura.releitura,
          leituraOriginal: leitura.original,
        }
      : { arquivoPath: caminho, origem, modo: 'manual', modelo: null, documento: null, erroLeitura: leitura.erro },
  }
}

/**
 * Relê um arquivo já guardado com outro modelo (normalmente o preciso,
 * quando o rápido não entendeu). Não sobe nada de novo.
 */
export async function relerDespesa(arquivoPath: string, modelo: ModeloLeitura): Promise<Resultado<{ rascunho: Rascunho }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(arquivoPath)) return { ok: false, erro: 'Arquivo inválido. Nota importada do XML não precisa de releitura.' }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).download(arquivoPath)
  if (error || !data) return { ok: false, erro: 'Arquivo não encontrado. Envie a nota de novo.' }

  const extensao = arquivoPath.slice(arquivoPath.lastIndexOf('.') + 1)
  const mediaType = (extensao === 'pdf' ? 'application/pdf' : extensao === 'png' ? 'image/png' : extensao === 'webp' ? 'image/webp' : 'image/jpeg') as (typeof TIPOS_ARQUIVO)[number]
  const leitura = await lerEConferir(Buffer.from(await data.arrayBuffer()), mediaType, modelo)
  if (!leitura.ok) return { ok: false, erro: leitura.erro }

  return {
    ok: true,
    rascunho: {
      arquivoPath,
      origem: 'upload',
      modo: 'ia',
      modelo: leitura.modelo,
      documento: leitura.documento,
      erroLeitura: null,
      ajustes: leitura.ajustes,
      releitura: leitura.releitura,
      leituraOriginal: leitura.original,
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
  /** Tecido de cliente: vira envio de tecido, não despesa. */
  tecidoId: z.string().uuid().nullable().optional(),
})

const schemaDespesa = z.object({
  arquivoPath: z.string().min(1).nullable(),
  origem: z.enum(['camera', 'upload']),
  modo: z.enum(['manual', 'ia', 'xml']),
  modeloIa: z.enum(['rapido', 'preciso']).nullable().optional(),
  tipo: z.enum(TIPOS_DOCUMENTO),
  fornecedorNome: z.string().trim().max(200).nullable().optional(),
  fornecedorDoc: z.string().trim().max(20).nullable().optional(),
  destinatarioNome: z.string().trim().max(200).nullable().optional(),
  destinatarioDoc: z.string().trim().max(20).nullable().optional(),
  numero: z.string().trim().max(40).nullable().optional(),
  serie: z.string().trim().max(10).nullable().optional(),
  chaveAcesso: z.string().trim().max(44).nullable().optional(),
  emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de emissão'),
  formaPagamento: z.string().trim().max(60).nullable().optional(),
  condicao: z.enum(CONDICOES, { message: 'Escolha como a nota foi paga' }),
  parcelas: z
    .array(
      z.object({
        vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valor: z.number().positive(),
        /** Vencimento que a nota traz, quando o cartão mudou o usado (cruzamento com o extrato). */
        vencimentoOriginal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
    )
    .max(36)
    .default([]),
  /** Cartão de crédito usado (só com condição crédito); o banco exige quando há cartão cadastrado. */
  cartaoId: z.string().uuid().nullable().optional(),
  subtotal: z.number().min(0).nullable().optional(),
  desconto: z.number().min(0).default(0),
  frete: z.number().min(0).default(0),
  impostos: z.number().min(0).default(0),
  total: z.number().positive('Informe o valor total'),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  confianca: z.record(z.string(), z.number()).nullable().optional(),
  itens: z.array(schemaItem).min(1, 'A nota precisa ter ao menos um item').max(200),
  /** Dono do tecido, quando há item de tecido. */
  tecidoClienteId: z.string().uuid().nullable().optional(),
  /** O que a IA leu, como veio (só para medir o acerto; não muda nada do que é gravado). */
  leituraIa: z
    .object({ documento: z.record(z.string(), z.unknown()), releitura: z.array(z.string()).nullable().optional() })
    .nullable()
    .optional(),
  /** Quem confere já viu o aviso de nota parecida e quer salvar mesmo assim. */
  confirmarDuplicada: z.boolean().optional(),
})

export type DadosDespesa = z.input<typeof schemaDespesa>

function soDigitos(v: string | null | undefined) {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length ? d : null
}

/** Nota já lançada com o mesmo fornecedor, data e valor — provável repetição. */
export type DuplicataProvavel = { fornecedor: string; numero: string | null; emissao: string; total: number; itens: number }

/** O que mudou entre a leitura da IA e o que foi salvo, para a métrica de acerto. */
function camposAlterados(lido: Record<string, unknown>, d: z.output<typeof schemaDespesa>, docFornecedor: string | null, chave: string | null) {
  const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  const semZeros = (v: unknown) => dig(v).replace(/^0+(?=\d)/, '')
  const itensLidos = Array.isArray(lido.itens) ? (lido.itens as { valor_total?: number }[]) : []
  const comparacoes: [string, boolean][] = [
    ['tipo', lido.tipo === d.tipo],
    ['fornecedor_doc', dig(lido.fornecedor_doc) === (docFornecedor ?? '')],
    ['numero', semZeros(lido.numero) === semZeros(d.numero)],
    ['serie', semZeros(lido.serie) === semZeros(d.serie)],
    ['chave_acesso', dig(lido.chave_acesso) === (chave ?? '')],
    ['emissao', lido.emissao === d.emissao],
    ['total', Math.abs(Number(lido.total ?? 0) - d.total) < 0.005],
    ['condicao_pagamento', (lido.condicao_pagamento ?? null) === d.condicao],
    ['qtd_itens', itensLidos.length === d.itens.length],
  ]
  return comparacoes.filter(([, igual]) => !igual).map(([campo]) => campo)
}

/**
 * Itens de tecido de cliente viram envios de tecido (um por tecido), com a
 * nota como NF de remessa. O saldo do cliente só muda quando a equipe confere
 * a metragem — exatamente como um envio registrado à mão.
 */
async function criarEnviosDeTecido(
  perfilId: string,
  clienteId: string,
  itens: { descricao: string; quantidade: number; unidade: string | null | undefined; tecidoId: string }[],
  nota: { numero: string | null | undefined; arquivoPath: string | null; fornecedor: string | null | undefined }
): Promise<Resultado<{ envios: number; reaproveitados: string[] }>> {
  const supabase = await createClient()
  const admin = createAdminClient()

  // O cliente pode já ter avisado este envio pelo portal, com o número da NF.
  // Aí a nota lida não vira outro envio: é anexada ao que ele abriu (o banco
  // recusaria a repetição de qualquer jeito — aqui a mensagem é melhor)
  const nfNumero = (nota.numero ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  const reaproveitados: string[] = []
  if (nfNumero) {
    const { data: abertos } = await supabase
      .from('tecido_envios')
      .select('id, tecido_id, nf_numero, nf_caminho, metros_informados, situacao, criado_em, tecidos(nome)')
      .eq('cliente_id', clienteId)
      .neq('situacao', 'recusado')
    const mesmaNf = (abertos ?? []).filter(
      (e) => String(e.nf_numero ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '') === nfNumero
    )
    const conferido = mesmaNf.find((e) => e.situacao === 'conferido')
    if (conferido) {
      return {
        ok: false,
        erro: `A NF ${nfNumero} deste cliente já foi conferida em ${new Date(String(conferido.criado_em)).toLocaleDateString('pt-BR')}: o tecido já está no estoque dele. Não registre de novo.`,
      }
    }
    for (const e of mesmaNf) {
      // Mesmo tecido do envio aberto: anexa a nota e tira da lista de criação
      const tecidoId = String(e.tecido_id)
      if (!itens.some((i) => i.tecidoId === tecidoId)) continue
      if (nota.arquivoPath && !e.nf_caminho) {
        const { data } = await admin.storage.from(BUCKET).download(nota.arquivoPath)
        if (data) {
          const ext = nota.arquivoPath.slice(nota.arquivoPath.lastIndexOf('.') + 1)
          const caminho = `tecidos/${clienteId}/${e.id}/nf-remessa.${ext}`
          const tipo = ext === 'pdf' ? 'application/pdf' : ext === 'xml' ? 'text/xml' : ext === 'png' ? 'image/png' : 'image/jpeg'
          const { error: erroUp } = await admin.storage.from('documentos').upload(caminho, data, { contentType: tipo, upsert: true })
          if (!erroUp) await supabase.rpc('anexar_nf_envio_tecido', { p_envio_id: e.id, p_nf_numero: nfNumero, p_nf_caminho: caminho })
        }
      }
      const nome = (e.tecidos as unknown as { nome: string } | null)?.nome ?? 'tecido'
      reaproveitados.push(`${nome} — o cliente já tinha avisado ${Number(e.metros_informados).toLocaleString('pt-BR')} m em ${new Date(String(e.criado_em)).toLocaleDateString('pt-BR')}; a nota foi anexada a esse envio`)
      itens = itens.filter((i) => i.tecidoId !== tecidoId)
    }
    if (!itens.length) {
      revalidatePath('/admin/estoque')
      return { ok: true, envios: 0, reaproveitados }
    }
  }

  // Mesmo tecido em duas linhas: um envio só, com a metragem somada
  const porTecido = new Map<string, { metros: number; descricoes: string[] }>()
  for (const i of itens) {
    const atual = porTecido.get(i.tecidoId) ?? { metros: 0, descricoes: [] }
    atual.metros += i.quantidade
    atual.descricoes.push(`${i.descricao} (${i.quantidade} ${i.unidade || 'm'})`)
    porTecido.set(i.tecidoId, atual)
  }

  // A nota é o comprovante do envio: copia do bucket despesas para o bucket
  // documentos, no caminho que o envio de tecido usa
  let nfBytes: { conteudo: Blob; ext: string } | null = null
  if (nota.arquivoPath) {
    const { data } = await admin.storage.from(BUCKET).download(nota.arquivoPath)
    if (data) nfBytes = { conteudo: data, ext: nota.arquivoPath.slice(nota.arquivoPath.lastIndexOf('.') + 1) }
  }

  let criados = 0
  for (const [tecidoId, t] of porTecido) {
    const { data: envio, error } = await supabase
      .from('tecido_envios')
      .insert({
        cliente_id: clienteId,
        tecido_id: tecidoId,
        metros_informados: Math.round(t.metros * 1000) / 1000,
        nf_numero: nota.numero || null,
        observacao: `Lançado pela nota${nota.fornecedor ? ` de ${nota.fornecedor}` : ''}: ${t.descricoes.join('; ')}`.slice(0, 500),
        criado_por: perfilId,
      })
      .select('id')
      .single()
    if (error || !envio) {
      return { ok: false, erro: error?.hint === 'envio_duplicado' ? error.message : `Não deu para registrar o envio de tecido: ${error?.message ?? 'erro desconhecido'}` }
    }
    criados++

    if (nfBytes) {
      const caminho = `tecidos/${clienteId}/${envio.id}/nf-remessa.${nfBytes.ext}`
      const tipo = nfBytes.ext === 'pdf' ? 'application/pdf' : nfBytes.ext === 'xml' ? 'text/xml' : nfBytes.ext === 'png' ? 'image/png' : 'image/jpeg'
      const { error: erroUp } = await admin.storage.from('documentos').upload(caminho, nfBytes.conteudo, { contentType: tipo, upsert: true })
      if (!erroUp) {
        await supabase.rpc('anexar_nf_envio_tecido', { p_envio_id: envio.id, p_nf_numero: nota.numero || null, p_nf_caminho: caminho })
      }
    }
  }
  revalidatePath('/admin/estoque')
  return { ok: true, envios: criados, reaproveitados }
}

export async function salvarDespesa(
  dados: DadosDespesa
): Promise<Resultado<{ id: string | null; avisoCustos: string | null; envios: number; reaproveitados: string[] }> | { ok: false; erro: string; duplicata: DuplicataProvavel }> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaDespesa.safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data

  // Tecido de cliente sai da despesa e vira envio de tecido
  const itensTecido = d.itens.filter((i) => i.tecidoId)
  const itensDespesa = d.itens.filter((i) => !i.tecidoId)
  if (itensTecido.length && !d.tecidoClienteId) {
    return { ok: false, erro: 'Esta nota tem tecido de cliente: escolha de qual cliente é o tecido.' }
  }
  if (itensTecido.length && !itensDespesa.length) {
    // Nota só de tecido: nada é despesa da empresa, só o envio
    const r = await criarEnviosDeTecido(
      perfil.id,
      d.tecidoClienteId!,
      itensTecido.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, tecidoId: i.tecidoId! })),
      { numero: d.numero, arquivoPath: d.arquivoPath, fornecedor: d.fornecedorNome }
    )
    if (!r.ok) return r
    return { ok: true, id: null, avisoCustos: null, envios: r.envios, reaproveitados: r.reaproveitados }
  }
  d.itens = itensDespesa

  const chave = soDigitos(d.chaveAcesso)
  if (chave && !chaveAcessoValida(chave)) return { ok: false, erro: 'Chave de acesso inválida: confira os 44 dígitos com o documento.' }
  const docFornecedor = soDigitos(d.fornecedorDoc)
  if (docFornecedor && !cnpjCpfValido(docFornecedor)) return { ok: false, erro: 'CNPJ/CPF do fornecedor inválido: confira os dígitos com o documento.' }
  const docDestinatario = soDigitos(d.destinatarioDoc)
  if (docDestinatario && !cnpjCpfValido(docDestinatario)) return { ok: false, erro: 'CNPJ/CPF do destinatário inválido: confira os dígitos ou apague o campo.' }

  const emissao = avisoDaEmissao(d.emissao, hojeBrasilia())
  if (emissao?.bloqueia) return { ok: false, erro: emissao.texto }

  // A chave é a fonte mais confiável da nota: o que ela diz não pode divergir
  const divergencias = divergenciasDaChave(
    { tipo: d.tipo, fornecedorDoc: docFornecedor ?? '', numero: d.numero ?? '', serie: d.serie ?? '', emissao: d.emissao },
    chave
  )
  if (divergencias.length) return { ok: false, erro: `Não bate com a chave de acesso: ${divergencias.join('; ')}. Corrija o campo ou confira a chave.` }

  if (!quitadaNaCompra(d.condicao)) {
    const erroParcelas = validarParcelas(d.parcelas, d.total)
    if (erroParcelas) return { ok: false, erro: erroParcelas }
  }

  const supabase = await createClient()

  // Mesmo fornecedor, mesmo dia e mesmo valor: quase sempre é a mesma nota
  // lançada duas vezes (cupom sem chave, foto de novo). Avisa; quem confere decide
  if (!d.confirmarDuplicada) {
    const { data: parecidas } = await supabase
      .from('despesas')
      .select('fornecedor_nome, fornecedor_doc, numero, tipo, emissao, total, despesa_itens(quantidade)')
      .is('excluido_em', null)
      .eq('emissao', d.emissao)
      .eq('total', d.total)
      .limit(20)
    const nome = (d.fornecedorNome ?? '').trim().toLowerCase()
    const qtdNova = d.itens.reduce((s, i) => s + i.quantidade, 0)
    // Mesmo fornecedor, tipo, data, valor e quantidades: é a mesma nota
    const igual = (parecidas ?? []).find((x) => {
      const mesmoFornecedor = docFornecedor && x.fornecedor_doc ? x.fornecedor_doc === docFornecedor : !!nome && String(x.fornecedor_nome ?? '').trim().toLowerCase() === nome
      const itensX = (x.despesa_itens ?? []) as { quantidade: number | string }[]
      const qtdX = itensX.reduce((s, i) => s + Number(i.quantidade), 0)
      const mesmaQtd = itensX.length === 0 || (itensX.length === d.itens.length && Math.abs(qtdX - qtdNova) < 0.001)
      return mesmoFornecedor && x.tipo === d.tipo && mesmaQtd
    })
    if (igual) {
      return {
        ok: false,
        erro: 'Parece que esta nota já foi lançada.',
        duplicata: {
          fornecedor: String(igual.fornecedor_nome ?? d.fornecedorNome ?? 'fornecedor'),
          numero: (igual.numero as string | null) ?? null,
          emissao: String(igual.emissao),
          total: Number(igual.total),
          itens: ((igual.despesa_itens ?? []) as unknown[]).length,
        },
      }
    }
  }

  const { data: despesa, error } = await supabase
    .from('despesas')
    .insert({
      tipo: d.tipo,
      fornecedor_nome: d.fornecedorNome || null,
      fornecedor_doc: docFornecedor,
      destinatario_nome: d.destinatarioNome || null,
      destinatario_doc: docDestinatario,
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
      versao_prompt: d.modo === 'ia' ? VERSAO_PROMPT : null,
      leitura_ia:
        d.modo === 'ia' && d.leituraIa
          ? {
              modelo: d.modeloIa ?? null,
              releitura: d.leituraIa.releitura ?? null,
              alterados: camposAlterados(d.leituraIa.documento, d, docFornecedor, chave),
              documento: d.leituraIa.documento,
            }
          : null,
      observacoes: d.observacoes || null,
      criado_por: perfil.id,
    })
    .select('id')
    .single()

  if (error) {
    // Regras do gatilho `despesas_validar` (mesmo nº/série do fornecedor, data, chave)
    if (error.hint === 'nota_invalida') return { ok: false, erro: error.message }
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
    p_parcelas: quitadaNaCompra(d.condicao) ? null : d.parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor, vencimento_original: p.vencimentoOriginal ?? null })),
    p_categoria_id: categoriaConta,
    p_cartao_id: d.condicao === 'credito' ? d.cartaoId ?? null : null,
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
    // Sem os itens a despesa não vale: tira as contas a pagar e o cabeçalho
    // para não ficar pela metade (a chave das contas é RESTRICT de propósito)
    const admin = createAdminClient()
    await admin.from('contas_pagar').delete().eq('despesa_id', despesa.id)
    await admin.from('despesas').delete().eq('id', despesa.id)
    return { ok: false, erro: erroItens.message }
  }

  // Compra de suprimento pode mexer no custo por metro, se a opção estiver
  // ligada em Financeiro → Custos. Nunca derruba o lançamento da nota
  const avisoCustos = d.itens.some((i) => i.suprimentoId) ? await aplicarCustosAutomaticos(supabase) : null

  // Nota mista: os itens de tecido viram envios, os demais ficaram na despesa
  let envios = 0
  let reaproveitados: string[] = []
  if (itensTecido.length) {
    const r = await criarEnviosDeTecido(
      perfil.id,
      d.tecidoClienteId!,
      itensTecido.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, tecidoId: i.tecidoId! })),
      { numero: d.numero, arquivoPath: d.arquivoPath, fornecedor: d.fornecedorNome }
    )
    if (!r.ok) return { ok: false, erro: `A despesa foi salva, mas ${r.erro.toLowerCase()} Registre o envio em Estoque → Tecidos.` }
    envios = r.envios
    reaproveitados = r.reaproveitados
  }

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
      { campo: 'Modo', de: null, para: d.modo === 'ia' ? `lida por IA (${d.modeloIa ?? 'rapido'}) e conferida` : d.modo === 'xml' ? 'importada do XML da NF-e' : 'digitada' },
    ],
  })

  revalidar()
  revalidatePath('/admin/financeiro/a-pagar')
  if (avisoCustos) revalidatePath('/admin/financeiro/custos')
  return { ok: true, id: despesa.id, avisoCustos, envios, reaproveitados }
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
