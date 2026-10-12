'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import type { Condicao } from '@/lib/contas-pagar/condicoes'
import { hojeBrasilia } from '@/lib/datas'

/**
 * Contas a pagar — só admin/financeiro.
 *
 * Só nascem da nota ou recibo (Estoque → Despesas, ao salvar). Toda escrita
 * passa por função do banco (`admin_*_conta_pagar`), que valida de novo; a
 * auditoria guarda quem fez e o motivo.
 */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

const CAMINHO = '/admin/financeiro/a-pagar'

async function exigirAdmin() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro') ? perfil : null
}

export type ContaPagar = {
  id: string
  despesaId: string | null
  descricao: string
  fornecedor: string | null
  categoria: string | null
  forma: Condicao
  parcela: number
  parcelas: number
  valor: number
  vencimento: string
  pagoEm: string | null
  valorPago: number | null
  baixaObs: string | null
  canceladaEm: string | null
  canceladaMotivo: string | null
  observacao: string | null
  /** Nota lançada sem foto/PDF, ou conta avulsa antiga. */
  semComprovante: boolean
  /** Cartão de crédito da compra (conta no crédito com cartão escolhido). */
  cartao: string | null
  cartaoId: string | null
}

export type FiltroContas = {
  situacao: 'abertas' | 'pagas' | 'canceladas' | 'todas'
  /** AAAA-MM-DD — vencimento (abertas/canceladas/todas) ou pagamento (pagas). */
  de?: string
  ate?: string
  /** Só as contas cuja nota está sem foto/PDF (aviso do dashboard). */
  semComprovante?: boolean
  /** Só as compras de um cartão de crédito (id). */
  cartao?: string
}

type LinhaBanco = {
  id: string
  despesa_id: string | null
  descricao: string
  fornecedor_nome: string | null
  forma: Condicao
  parcela: number
  parcelas: number
  valor: number | string
  vencimento: string
  pago_em: string | null
  valor_pago: number | string | null
  baixa_obs: string | null
  cancelada_em: string | null
  cancelada_motivo: string | null
  observacao: string | null
  categorias_despesa: { nome: string } | null
  despesas: { arquivo_path: string | null } | null
  cartao_id: string | null
  cartoes_credito: { nome: string; final: string | null } | null
}

const paraConta = (c: LinhaBanco): ContaPagar => ({
  id: c.id,
  despesaId: c.despesa_id,
  descricao: c.descricao,
  fornecedor: c.fornecedor_nome,
  categoria: c.categorias_despesa?.nome ?? null,
  forma: c.forma,
  parcela: c.parcela,
  parcelas: c.parcelas,
  valor: Number(c.valor),
  vencimento: c.vencimento,
  pagoEm: c.pago_em,
  valorPago: c.valor_pago != null ? Number(c.valor_pago) : null,
  baixaObs: c.baixa_obs,
  canceladaEm: c.cancelada_em,
  canceladaMotivo: c.cancelada_motivo,
  observacao: c.observacao,
  semComprovante: !c.despesas?.arquivo_path,
  cartaoId: c.cartao_id,
  cartao: c.cartoes_credito ? (c.cartoes_credito.final ? `${c.cartoes_credito.nome} · ${c.cartoes_credito.final}` : c.cartoes_credito.nome) : null,
})

const CAMPOS =
  'id, despesa_id, descricao, fornecedor_nome, forma, parcela, parcelas, valor, vencimento, pago_em, valor_pago, baixa_obs, cancelada_em, cancelada_motivo, observacao, cartao_id, categorias_despesa(nome), despesas(arquivo_path), cartoes_credito(nome, final)'

export type ResumoContas = {
  vencidas: { qtd: number; valor: number }
  proximos7: { qtd: number; valor: number }
  restoDoMes: { qtd: number; valor: number }
  pagoNoMes: { qtd: number; valor: number }
}

const hojeIso = () => {
  // Data de hoje no horário de Brasília (o servidor roda em UTC)
  return hojeBrasilia()
}

export async function listarContasPagar(filtro: FiltroContas): Promise<{ contas: ContaPagar[]; resumo: ResumoContas; hoje: string } | null> {
  if (!(await exigirAdmin())) return null
  const supabase = await createClient()
  const hoje = hojeIso()
  const inicioMes = hoje.slice(0, 8) + '01'
  const fimMes = (() => {
    const [a, m] = hoje.split('-').map(Number)
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  })()

  let q = supabase.from('contas_pagar').select(CAMPOS)
  if (filtro.situacao === 'abertas') q = q.is('pago_em', null).is('cancelada_em', null)
  if (filtro.situacao === 'pagas') q = q.not('pago_em', 'is', null)
  if (filtro.situacao === 'canceladas') q = q.not('cancelada_em', 'is', null)
  if (filtro.cartao) q = q.eq('cartao_id', filtro.cartao)
  const colunaData = filtro.situacao === 'pagas' ? 'pago_em' : 'vencimento'
  if (filtro.de) q = q.gte(colunaData, filtro.de)
  if (filtro.ate) q = q.lte(colunaData, filtro.ate)
  q = q.order(colunaData, { ascending: filtro.situacao !== 'pagas' }).order('parcela').limit(1000)

  // Resumo: sempre das abertas e do pago no mês, independente do filtro
  const [lista, abertas, pagasMes] = await Promise.all([
    q,
    supabase.from('contas_pagar').select('valor, vencimento').is('pago_em', null).is('cancelada_em', null),
    supabase.from('contas_pagar').select('valor_pago').gte('pago_em', inicioMes).lte('pago_em', fimMes),
  ])
  if (lista.error) throw new Error(lista.error.message)

  const em7 = (() => {
    const [a, m, d] = hoje.split('-').map(Number)
    return new Date(Date.UTC(a, m - 1, d + 7)).toISOString().slice(0, 10)
  })()
  const soma = (xs: { valor: number | string }[]) => ({ qtd: xs.length, valor: xs.reduce((s, x) => s + Number(x.valor), 0) })
  const ab = (abertas.data ?? []) as { valor: number | string; vencimento: string }[]
  const resumo: ResumoContas = {
    vencidas: soma(ab.filter((c) => c.vencimento < hoje)),
    proximos7: soma(ab.filter((c) => c.vencimento >= hoje && c.vencimento <= em7)),
    restoDoMes: soma(ab.filter((c) => c.vencimento >= hoje && c.vencimento <= fimMes)),
    pagoNoMes: soma(((pagasMes.data ?? []) as { valor_pago: number | string }[]).map((p) => ({ valor: p.valor_pago }))),
  }

  const contas = ((lista.data ?? []) as unknown as LinhaBanco[]).map(paraConta)
  return { contas: filtro.semComprovante ? contas.filter((c) => c.semComprovante) : contas, resumo, hoje }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => iso.split('-').reverse().join('/')
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
const motivo = z.string().trim().min(10, 'Descreva o motivo (mín. 10 caracteres)').max(500)

export async function baixarContaPagar(id: string, pagoEm: string, valorPago: number, obs: string | null): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = z
    .object({ id: z.string().uuid(), pagoEm: data, valorPago: z.number().positive('Informe o valor pago'), obs: z.string().trim().max(500).nullable() })
    .safeParse({ id, pagoEm, valorPago, obs })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_baixar_conta_pagar', {
    p_id: id,
    p_pago_em: pagoEm,
    p_valor_pago: valorPago,
    p_obs: obs || null,
  })
  if (error) return { ok: false, erro: error.message }
  await registrar({
    entidade: 'conta_pagar',
    entidadeId: id,
    acao: 'pagou',
    campos: [{ campo: 'Pagamento', de: null, para: `R$ ${brl(valorPago)} em ${dataBr(pagoEm)}` }],
  })
  revalidatePath(CAMINHO)
  return { ok: true }
}

export async function estornarContaPagar(id: string, motivoTexto: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const m = motivo.safeParse(motivoTexto)
  if (!m.success) return { ok: false, erro: m.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_estornar_conta_pagar', { p_id: id, p_motivo: m.data })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'conta_pagar', entidadeId: id, acao: 'estornou', campos: [], motivo: m.data })
  revalidatePath(CAMINHO)
  return { ok: true }
}

export async function cancelarContaPagar(id: string, motivoTexto: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const m = motivo.safeParse(motivoTexto)
  if (!m.success) return { ok: false, erro: m.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_cancelar_conta_pagar', { p_id: id, p_motivo: m.data })
  if (error) return { ok: false, erro: error.message }
  await registrar({ entidade: 'conta_pagar', entidadeId: id, acao: 'cancelou', campos: [], motivo: m.data })
  revalidatePath(CAMINHO)
  return { ok: true }
}

export async function alterarContaPagar(id: string, vencimento: string, valor: number, motivoTexto: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = z
    .object({ vencimento: data, valor: z.number().positive('Informe o valor'), motivo })
    .safeParse({ vencimento, valor, motivo: motivoTexto })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data: antes } = await supabase.from('contas_pagar').select('vencimento, valor').eq('id', id).maybeSingle()
  const { error } = await supabase.rpc('admin_alterar_conta_pagar', {
    p_id: id,
    p_vencimento: vencimento,
    p_valor: valor,
    p_motivo: parsed.data.motivo,
  })
  if (error) return { ok: false, erro: error.message }
  await registrar({
    entidade: 'conta_pagar',
    entidadeId: id,
    acao: 'editou',
    campos: [
      { campo: 'Vencimento', de: antes ? dataBr(String(antes.vencimento)) : null, para: dataBr(vencimento) },
      { campo: 'Valor', de: antes ? `R$ ${brl(Number(antes.valor))}` : null, para: `R$ ${brl(valor)}` },
    ].filter((c) => c.de !== c.para),
    motivo: parsed.data.motivo,
  })
  revalidatePath(CAMINHO)
  return { ok: true }
}
