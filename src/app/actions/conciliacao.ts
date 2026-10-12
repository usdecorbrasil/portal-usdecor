'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import { buscarAguardandoRecebimento } from './clientes'
import { lerOfx, decodificarOfx } from '@/lib/conciliacao/ofx'
import { lerExtrato, VERSAO_PROMPT_EXTRATO } from '@/lib/conciliacao/ler-extrato'
import { sugerirConta, sugerirCobranca, type ContaCandidata, type CobrancaCandidata, type Sugestao, type Certeza } from '@/lib/conciliacao/casar'
import type { ExtratoLido } from '@/lib/conciliacao/tipos'
import { somarDias } from '@/lib/datas'
import type { ModeloLeitura } from '@/lib/despesas/ler-documento'

/**
 * Conciliação de extratos (Financeiro → Conciliação). Só admin/financeiro.
 * Importa o arquivo (OFX direto; PDF, imagem ou CSV pela IA), guarda os
 * lançamentos e, na tela, sugere o vínculo de cada um com conta a pagar ou
 * cobrança de pedido. Toda escrita de vínculo passa por RPC.
 */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

const BUCKET = 'extratos'
const CAMINHO = '/admin/financeiro/conciliacao'
const TAMANHO_MAXIMO = 10 * 1024 * 1024
const MARGEM_DIAS = 45

async function exigirAdmin() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro') ? perfil : null
}

export type ResumoExtrato = {
  id: string
  tipo: 'banco' | 'cartao'
  origem: string | null
  cartao: string | null
  periodoInicio: string | null
  periodoFim: string | null
  modo: 'ia' | 'ofx'
  fechadoEm: string | null
  criadoEm: string
  total: number
  pendentes: number
  conciliados: number
  ignorados: number
  entradas: number
  saidas: number
}

type LinhaExtrato = {
  id: string
  tipo: 'banco' | 'cartao'
  origem: string | null
  cartao_id: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  modo: 'ia' | 'ofx'
  fechado_em: string | null
  criado_em: string
  cartoes_credito: { nome: string; final: string | null } | null
}

export async function listarExtratos(): Promise<ResumoExtrato[]> {
  if (!(await exigirAdmin())) return []
  const supabase = await createClient()
  const [{ data: extratos, error }, { data: lancs }] = await Promise.all([
    supabase.from('extratos').select('id, tipo, origem, cartao_id, periodo_inicio, periodo_fim, modo, fechado_em, criado_em, cartoes_credito(nome, final)').order('criado_em', { ascending: false }).limit(200),
    supabase.from('extrato_lancamentos').select('extrato_id, situacao, tipo, valor').limit(20000),
  ])
  if (error) throw new Error(error.message)
  const porExtrato = new Map<string, { situacao: string; tipo: string; valor: number }[]>()
  for (const l of (lancs ?? []) as { extrato_id: string; situacao: string; tipo: string; valor: number | string }[]) {
    porExtrato.set(l.extrato_id, [...(porExtrato.get(l.extrato_id) ?? []), { situacao: l.situacao, tipo: l.tipo, valor: Number(l.valor) }])
  }
  return ((extratos ?? []) as unknown as LinhaExtrato[]).map((e) => {
    const ls = porExtrato.get(e.id) ?? []
    return {
      id: e.id,
      tipo: e.tipo,
      origem: e.origem,
      cartao: e.cartoes_credito ? (e.cartoes_credito.final ? `${e.cartoes_credito.nome} · ${e.cartoes_credito.final}` : e.cartoes_credito.nome) : null,
      periodoInicio: e.periodo_inicio,
      periodoFim: e.periodo_fim,
      modo: e.modo,
      fechadoEm: e.fechado_em,
      criadoEm: e.criado_em,
      total: ls.length,
      pendentes: ls.filter((l) => l.situacao === 'pendente').length,
      conciliados: ls.filter((l) => l.situacao === 'conciliado').length,
      ignorados: ls.filter((l) => l.situacao === 'ignorado').length,
      entradas: ls.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0),
      saidas: ls.filter((l) => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0),
    }
  })
}

const TIPOS_IA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'text/plain'] as const
type TipoIa = (typeof TIPOS_IA)[number]

/** Importa o arquivo: OFX é lido direto; o resto vai para a IA. */
export async function importarExtrato(form: FormData): Promise<Resultado<{ id: string; quantos: number; modo: 'ia' | 'ofx' }>> {
  const perfil = await exigirAdmin()
  if (!perfil) return { ok: false, erro: 'Acesso negado.' }
  const campos = z
    .object({
      tipo: z.enum(['banco', 'cartao']),
      cartaoId: z.string().uuid().nullable(),
      modelo: z.enum(['rapido', 'preciso']).default('rapido'),
      origem: z.string().trim().max(80).nullable(),
    })
    .safeParse({
      tipo: form.get('tipo'),
      cartaoId: (form.get('cartaoId') as string) || null,
      modelo: (form.get('modelo') as string) || 'rapido',
      origem: (form.get('origem') as string) || null,
    })
  if (!campos.success) return { ok: false, erro: campos.error.issues[0].message }
  if (campos.data.tipo === 'cartao' && !campos.data.cartaoId) return { ok: false, erro: 'Escolha de qual cartão é a fatura.' }

  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: 'Escolha o arquivo do extrato.' }
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: 'Arquivo acima de 10 MB.' }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const nome = arquivo.name.toLowerCase()
  const cabecalho = new TextDecoder('latin1').decode(bytes.slice(0, 2000))
  const ehOfx = nome.endsWith('.ofx') || /OFXHEADER|<OFX>/i.test(cabecalho)

  let lido: ExtratoLido
  let modo: 'ia' | 'ofx'
  let modeloIa: ModeloLeitura | null = null
  let mediaType: string
  if (ehOfx) {
    const r = lerOfx(decodificarOfx(bytes))
    if (!r.ok) return r
    lido = r.extrato
    modo = 'ofx'
    mediaType = 'application/x-ofx'
  } else {
    const tipo = (nome.endsWith('.csv') ? 'text/csv' : nome.endsWith('.txt') ? 'text/plain' : arquivo.type) as TipoIa
    if (!TIPOS_IA.includes(tipo)) return { ok: false, erro: 'Aceito OFX, PDF, JPG, PNG, WebP ou CSV.' }
    const r = await lerExtrato({ conteudo: Buffer.from(bytes), mediaType: tipo, modelo: campos.data.modelo })
    if (!r.ok) return r
    lido = r.extrato
    modo = 'ia'
    modeloIa = r.modelo
    mediaType = tipo
  }

  const admin = createAdminClient()
  const ext = ehOfx ? 'ofx' : nome.split('.').pop() || 'bin'
  const caminho = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
  const { error: erroUp } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: mediaType })
  if (erroUp) return { ok: false, erro: `Não deu para guardar o arquivo: ${erroUp.message}` }

  const { data: extrato, error } = await admin
    .from('extratos')
    .insert({
      tipo: campos.data.tipo,
      cartao_id: campos.data.tipo === 'cartao' ? campos.data.cartaoId : null,
      origem: campos.data.origem || lido.origem,
      periodo_inicio: lido.periodoInicio,
      periodo_fim: lido.periodoFim,
      arquivo_path: caminho,
      modo,
      modelo_ia: modeloIa ? `${modeloIa} · ${VERSAO_PROMPT_EXTRATO}` : null,
      criado_por: perfil.id,
    })
    .select('id')
    .single()
  if (error) {
    await admin.storage.from(BUCKET).remove([caminho])
    return { ok: false, erro: error.message }
  }
  const { error: erroL } = await admin.from('extrato_lancamentos').insert(
    lido.lancamentos.map((l, i) => ({ extrato_id: extrato.id, linha: i + 1, data: l.data, descricao: l.descricao.slice(0, 300), valor: l.valor, tipo: l.tipo, documento: l.documento }))
  )
  if (erroL) {
    await admin.from('extratos').delete().eq('id', extrato.id)
    await admin.storage.from(BUCKET).remove([caminho])
    return { ok: false, erro: erroL.message }
  }
  await registrar({
    entidade: 'extrato',
    entidadeId: extrato.id,
    acao: 'criou',
    campos: [{ campo: 'Extrato', de: null, para: `${campos.data.tipo === 'cartao' ? 'fatura de cartão' : 'extrato bancário'} · ${lido.lancamentos.length} lançamentos · ${modo === 'ofx' ? 'OFX' : 'lido por IA'}` }],
  })
  revalidatePath(CAMINHO)
  return { ok: true, id: extrato.id, quantos: lido.lancamentos.length, modo }
}

export type Lancamento = {
  id: string
  linha: number
  data: string
  descricao: string
  valor: number
  tipo: 'entrada' | 'saida'
  documento: string | null
  situacao: 'pendente' | 'conciliado' | 'ignorado'
  observacao: string | null
  /** Com o que está vinculado, em texto, quando conciliado. */
  vinculo: string | null
  contaPagarId: string | null
  pedidoId: string | null
  numeroParcela: number | null
  /** Sugestões para os pendentes. */
  certeza: Certeza
  contas: Sugestao<ContaCandidata>[]
  cobrancas: Sugestao<CobrancaCandidata>[]
}

export type ExtratoAberto = {
  resumo: ResumoExtrato
  cartaoId: string | null
  lancamentos: Lancamento[]
  /** Todas as candidatas do período, para a busca manual na tela. */
  contas: ContaCandidata[]
  cobrancas: CobrancaCandidata[]
}

type LinhaConta = {
  id: string
  descricao: string
  fornecedor_nome: string | null
  valor: number | string
  vencimento: string
  pago_em: string | null
  data_compra: string | null
  cartao_id: string | null
  parcela: number
  parcelas: number
}

export async function carregarExtrato(id: string): Promise<ExtratoAberto | null> {
  if (!(await exigirAdmin())) return null
  if (!z.string().uuid().safeParse(id).success) return null
  const supabase = await createClient()
  const lista = await listarExtratos()
  const resumo = lista.find((e) => e.id === id)
  if (!resumo) return null
  const { data: cab } = await supabase.from('extratos').select('cartao_id').eq('id', id).single()

  const datas = { de: resumo.periodoInicio, ate: resumo.periodoFim }
  const [{ data: lancs, error }, { data: contasRaw }, cobrancasTodas] = await Promise.all([
    supabase
      .from('extrato_lancamentos')
      .select('id, linha, data, descricao, valor, tipo, documento, situacao, observacao, conta_pagar_id, pedido_id, numero_parcela, contas_pagar(descricao, valor), pedidos(numero)')
      .eq('extrato_id', id)
      .order('linha'),
    (() => {
      let q = supabase.from('contas_pagar').select('id, descricao, fornecedor_nome, valor, vencimento, pago_em, data_compra, cartao_id, parcela, parcelas').is('cancelada_em', null).limit(2000)
      if (datas.de) q = q.gte('vencimento', somarDias(datas.de, -MARGEM_DIAS))
      if (datas.ate) q = q.lte('vencimento', somarDias(datas.ate, MARGEM_DIAS * 2))
      return q
    })(),
    buscarAguardandoRecebimento(),
  ])
  if (error) throw new Error(error.message)

  const contas: ContaCandidata[] = ((contasRaw ?? []) as LinhaConta[]).map((c) => ({
    id: c.id,
    descricao: c.descricao,
    fornecedor: c.fornecedor_nome,
    valor: Number(c.valor),
    vencimento: c.vencimento,
    pagoEm: c.pago_em,
    dataCompra: c.data_compra,
    cartaoId: c.cartao_id,
    parcela: c.parcela,
    parcelas: c.parcelas,
  }))
  const cobrancas: CobrancaCandidata[] = cobrancasTodas.map((p) => ({
    pedidoId: p.pedidoId,
    numero: p.numero,
    clienteNome: p.clienteNome,
    numeroParcela: p.numeroParcela,
    valor: p.valor,
    vencimento: p.vencimento,
    pagoEm: p.pagoEm,
  }))

  type LinhaL = {
    id: string; linha: number; data: string; descricao: string; valor: number | string; tipo: 'entrada' | 'saida'; documento: string | null
    situacao: 'pendente' | 'conciliado' | 'ignorado'; observacao: string | null; conta_pagar_id: string | null; pedido_id: string | null; numero_parcela: number | null
    contas_pagar: { descricao: string; valor: number | string } | null; pedidos: { numero: number } | null
  }
  const ctx = { tipo: resumo.tipo, cartaoId: (cab?.cartao_id as string | null) ?? null }
  const lancamentos: Lancamento[] = ((lancs ?? []) as unknown as LinhaL[]).map((l) => {
    const base = { data: l.data, descricao: l.descricao, valor: Number(l.valor), tipo: l.tipo, documento: l.documento }
    const sc = l.situacao === 'pendente' && l.tipo === 'saida' ? sugerirConta(base, contas, ctx) : null
    const sb = l.situacao === 'pendente' && l.tipo === 'entrada' ? sugerirCobranca(base, cobrancas) : null
    return {
      id: l.id,
      linha: l.linha,
      ...base,
      situacao: l.situacao,
      observacao: l.observacao,
      vinculo: l.contas_pagar ? `${l.contas_pagar.descricao} · R$ ${Number(l.contas_pagar.valor).toFixed(2).replace('.', ',')}` : l.pedidos ? `Pedido #${l.pedidos.numero}${l.numero_parcela ? ` · parcela ${l.numero_parcela}` : ''}` : null,
      contaPagarId: l.conta_pagar_id,
      pedidoId: l.pedido_id,
      numeroParcela: l.numero_parcela,
      certeza: sc?.certeza ?? sb?.certeza ?? 'nenhuma',
      contas: sc?.sugestoes ?? [],
      cobrancas: sb?.sugestoes ?? [],
    }
  })

  return { resumo, cartaoId: ctx.cartaoId, lancamentos, contas, cobrancas }
}

function revalidar(id?: string) {
  revalidatePath(CAMINHO)
  if (id) revalidatePath(`${CAMINHO}/${id}`)
  revalidatePath('/admin/financeiro/a-pagar')
  revalidatePath('/admin/financeiro/a-receber')
  revalidatePath('/admin/financeiro')
}

export async function conciliarLancamento(
  id: string,
  alvo: { contaPagarId: string } | { pedidoId: string; numeroParcela: number | null },
  baixar: boolean,
  obs: string | null,
  extratoId: string
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, erro: 'Lançamento inválido.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_conciliar_lancamento', {
    p_id: id,
    p_conta_pagar_id: 'contaPagarId' in alvo ? alvo.contaPagarId : null,
    p_pedido_id: 'pedidoId' in alvo ? alvo.pedidoId : null,
    p_numero_parcela: 'pedidoId' in alvo ? alvo.numeroParcela : null,
    p_baixar: baixar,
    p_obs: obs?.trim() || null,
  })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'extrato', entidadeId: extratoId, acao: 'editou', campos: [{ campo: 'Conciliação', de: null, para: `lançamento vinculado${baixar ? ' com baixa' : ''}` }], motivo: obs })
  revalidar(extratoId)
  return { ok: true }
}

export async function ignorarLancamento(id: string, motivo: string, extratoId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_ignorar_lancamento', { p_id: id, p_motivo: motivo })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'extrato', entidadeId: extratoId, acao: 'editou', campos: [{ campo: 'Conciliação', de: null, para: 'lançamento ignorado' }], motivo })
  revalidar(extratoId)
  return { ok: true }
}

export async function desfazerConciliacao(id: string, extratoId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_desfazer_conciliacao', { p_id: id })
  if (error) return { ok: false, erro: error.message }
  revalidar(extratoId)
  return { ok: true }
}

export async function fecharExtrato(id: string, fechar: boolean): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_fechar_extrato', { p_id: id, p_fechar: fechar })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'extrato', entidadeId: id, acao: 'editou', campos: [{ campo: 'Situação', de: fechar ? 'aberto' : 'fechado', para: fechar ? 'fechado' : 'aberto' }] })
  revalidar(id)
  return { ok: true }
}

export async function excluirExtrato(id: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { data: caminho, error } = await supabase.rpc('admin_excluir_extrato', { p_id: id })
  if (error) return { ok: false, erro: error.message }
  if (caminho) await createAdminClient().storage.from(BUCKET).remove([caminho as string])
  await registrar({ entidade: 'extrato', entidadeId: id, acao: 'excluiu', campos: [] })
  revalidar()
  return { ok: true }
}
