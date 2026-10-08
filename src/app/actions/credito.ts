'use server'

import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { valorCobranca } from '@/lib/pagamento/config'
import {
  calcularScore,
  type BoletoHistorico,
  type ResultadoScore,
} from '@/lib/credito/score'

/**
 * Painel de crédito (Financeiro → Crédito): por cliente, limite, crédito em
 * uso, histórico de boletos, score e sugestão de limite. Só admin/financeiro
 * — tudo aqui é valor.
 *
 * Fontes: `pedido_parcelas` (boleto parcelado), `pedidos` com boleto à vista
 * (uma cobrança só, sem linha em parcelas), pedidos não cancelados do
 * período para volume e frequência, `credito_em_uso` para o que está em
 * boleto hoje, e `auditoria` para as mudanças de limite.
 */

export type LinhaCredito = {
  clienteId: string
  cliente: string
  ativo: boolean
  clienteDesde: string | null
  limite: number
  emUso: number
  faturamento: number
  pedidos: number
  score: ResultadoScore
}

export type PainelCredito = {
  meses: number
  de: string
  ate: string
  linhas: LinhaCredito[]
}

export type MudancaLimite = {
  data: string
  de: number | null
  para: number | null
  motivo: string | null
  autor: string | null
}

/**
 * Pedido em boleto que já conta no crédito em uso mas ainda não virou
 * boleto emitido: em produção (valor conhecido, cobrança só no Faturar) ou
 * faturado sem a cobrança gerada. Espelha a segunda metade de
 * `credito_em_uso` no banco — mexeu numa, mexa na outra.
 */
export type CobrancaPrevista = {
  pedidoId: string
  pedidoNumero: number
  etapa: string
  forma: string
  parcelas: number | null
  /** Valor cobrado estimado (mercadoria + taxa); 0 quando a metragem ainda não existe. */
  valor: number
  vencimentoPrevisto: string | null
}

export type FichaCredito = LinhaCredito & {
  boletos: BoletoHistorico[]
  /** Pedidos em boleto ainda sem boleto emitido (contam no crédito em uso). */
  previstos: CobrancaPrevista[]
  mudancasLimite: MudancaLimite[]
  atrasoLiberadoEm: string | null
  atrasoLiberadoMotivo: string | null
}

async function exigirAdmin() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro')
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10)
}

function inicioPeriodo(meses: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 10)
}

type ParcelaBruta = {
  numero: number
  valor: number
  vencimento: string
  pago_em: string | null
  pedidos: { id: string; numero: number; cliente_id: string; cancelado_em: string | null; parcelas_solicitadas: number | null } | null
}

type PedidoAvista = {
  id: string
  numero: number
  cliente_id: string
  total: number
  taxa_pagamento_percentual: number | null
  taxa_pagamento_fixa: number | null
  forma_pagamento: string | null
  vencimento_avista: string | null
  pago_em: string | null
}

/** Boletos de todos os clientes (ou de um), parcelados e à vista, sem cancelados. */
async function carregarBoletos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId?: string
): Promise<Map<string, BoletoHistorico[]>> {
  let qParcelas = supabase
    .from('pedido_parcelas')
    .select('numero, valor, vencimento, pago_em, pedidos!inner(id, numero, cliente_id, cancelado_em, parcelas_solicitadas)')
    .is('pedidos.cancelado_em', null)
  if (clienteId) qParcelas = qParcelas.eq('pedidos.cliente_id', clienteId)

  let qAvista = supabase
    .from('pedidos')
    .select('id, numero, cliente_id, total, taxa_pagamento_percentual, taxa_pagamento_fixa, forma_pagamento, vencimento_avista, pago_em')
    .eq('forma_pagamento', 'boleto_avista')
    .not('cobranca_gerada_em', 'is', null)
    .is('cancelado_em', null)
  if (clienteId) qAvista = qAvista.eq('cliente_id', clienteId)

  const [{ data: parcelas }, { data: avista }] = await Promise.all([qParcelas, qAvista])

  const porCliente = new Map<string, BoletoHistorico[]>()
  const add = (cid: string, b: BoletoHistorico) => {
    const lista = porCliente.get(cid) ?? []
    lista.push(b)
    porCliente.set(cid, lista)
  }

  for (const p of (parcelas ?? []) as unknown as ParcelaBruta[]) {
    if (!p.pedidos) continue
    add(p.pedidos.cliente_id, {
      pedidoId: p.pedidos.id,
      pedidoNumero: Number(p.pedidos.numero),
      parcela: `${p.numero}/${p.pedidos.parcelas_solicitadas ?? '?'}`,
      valor: Number(p.valor),
      vencimento: String(p.vencimento).slice(0, 10),
      pagoEm: p.pago_em ? String(p.pago_em).slice(0, 10) : null,
    })
  }

  for (const p of (avista ?? []) as unknown as PedidoAvista[]) {
    if (!p.vencimento_avista) continue
    add(p.cliente_id, {
      pedidoId: p.id,
      pedidoNumero: Number(p.numero),
      parcela: 'à vista',
      valor: valorCobranca(
        Number(p.total),
        Number(p.taxa_pagamento_percentual ?? 0),
        Number(p.taxa_pagamento_fixa ?? 0),
        p.forma_pagamento ?? 'boleto_avista',
        1
      ),
      vencimento: String(p.vencimento_avista).slice(0, 10),
      pagoEm: p.pago_em ? String(p.pago_em).slice(0, 10) : null,
    })
  }

  for (const lista of porCliente.values()) {
    lista.sort((a, b) => (a.vencimento < b.vencimento ? 1 : a.vencimento > b.vencimento ? -1 : 0))
  }
  return porCliente
}

/**
 * Pedidos em boleto do cliente que ainda não têm boleto emitido: sem parcela
 * gravada e, no à vista, sem cobrança gerada. São os que `credito_em_uso`
 * soma pelo `valor_cobranca_pedido`, e a ficha precisa mostrá-los, senão o
 * "em boletos hoje" não fecha com o histórico.
 */
async function carregarPrevistos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: string
): Promise<CobrancaPrevista[]> {
  const { data } = await supabase
    .from('pedidos')
    .select(
      'id, numero, total, taxa_pagamento_percentual, taxa_pagamento_fixa, forma_pagamento, ' +
        'parcelas_solicitadas, vencimento_avista, cobranca_gerada_em, ' +
        'pedido_parcelas(id), pedido_status_historico(status, created_at)'
    )
    .eq('cliente_id', clienteId)
    .like('forma_pagamento', 'boleto%')
    .is('cancelado_em', null)
    .is('agrupado_em', null)
    .is('pago_em', null)

  const CONTAM = new Set(['recebido', 'impressao', 'estampando', 'pronto', 'faturado', 'nf_emitida', 'expedido', 'entregue'])
  const lista: CobrancaPrevista[] = []

  for (const p of (data ?? []) as any[]) {
    const hist = ((p.pedido_status_historico ?? []) as { status: string; created_at: string }[])
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const etapa = hist[0]?.status ?? 'aguardando'
    if (!CONTAM.has(etapa)) continue
    // Já tem boleto emitido: aparece no histórico, não aqui
    if ((p.pedido_parcelas ?? []).length > 0) continue
    if (p.forma_pagamento === 'boleto_avista' && p.cobranca_gerada_em && p.vencimento_avista) continue

    const total = Number(p.total ?? 0)
    lista.push({
      pedidoId: p.id,
      pedidoNumero: Number(p.numero),
      etapa,
      forma: String(p.forma_pagamento),
      parcelas: p.parcelas_solicitadas != null ? Number(p.parcelas_solicitadas) : null,
      valor:
        total > 0
          ? valorCobranca(
              total,
              Number(p.taxa_pagamento_percentual ?? 0),
              Number(p.taxa_pagamento_fixa ?? 0),
              String(p.forma_pagamento),
              Number(p.parcelas_solicitadas ?? 1)
            )
          : 0,
      vencimentoPrevisto: p.vencimento_avista ? String(p.vencimento_avista).slice(0, 10) : null,
    })
  }

  lista.sort((a, b) => b.pedidoNumero - a.pedidoNumero)
  return lista
}

export async function painelCredito(meses = 12): Promise<PainelCredito | null> {
  if (!(await exigirAdmin())) return null
  const supabase = await createClient()
  const de = inicioPeriodo(meses)
  const ate = hojeIso()

  const [{ data: clientes }, { data: pedidos }, boletos] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, razao_social, limite_credito, ativo, arquivado, created_at')
      .is('arquivado', false)
      .order('razao_social'),
    supabase
      .from('pedidos')
      .select('cliente_id, total, created_at')
      .gte('created_at', `${de}T00:00:00`)
      .is('cancelado_em', null),
    carregarBoletos(supabase),
  ])

  const volume = new Map<string, { faturamento: number; pedidos: number }>()
  for (const p of (pedidos ?? []) as { cliente_id: string; total: number | null }[]) {
    const v = volume.get(p.cliente_id) ?? { faturamento: 0, pedidos: 0 }
    v.faturamento += Number(p.total ?? 0)
    v.pedidos += 1
    volume.set(p.cliente_id, v)
  }
  const maiorFaturamento = Math.max(0, ...[...volume.values()].map((v) => v.faturamento))

  const lista = (clientes ?? []) as { id: string; razao_social: string; limite_credito: number; ativo: boolean; created_at: string | null }[]
  const emUsoPorCliente = await Promise.all(
    lista.map(async (c) => {
      const { data } = await supabase.rpc('credito_em_uso', { p_cliente_id: c.id })
      return Number(data ?? 0)
    })
  )

  const linhas: LinhaCredito[] = lista.map((c, i) => {
    const v = volume.get(c.id) ?? { faturamento: 0, pedidos: 0 }
    const limite = Number(c.limite_credito ?? 0)
    const emUso = emUsoPorCliente[i]
    return {
      clienteId: c.id,
      cliente: c.razao_social,
      ativo: !!c.ativo,
      clienteDesde: c.created_at,
      limite,
      emUso,
      faturamento: v.faturamento,
      pedidos: v.pedidos,
      score: calcularScore({
        boletos: (boletos.get(c.id) ?? []).filter((b) => b.vencimento >= de || !b.pagoEm),
        faturamento: v.faturamento,
        maiorFaturamento,
        pedidos: v.pedidos,
        meses,
        limite,
        emUso,
        hoje: ate,
      }),
    }
  })

  linhas.sort((a, b) => b.score.score - a.score.score || a.cliente.localeCompare(b.cliente))
  return { meses, de, ate, linhas }
}

export async function fichaCredito(clienteId: string, meses = 12): Promise<FichaCredito | null> {
  if (!(await exigirAdmin())) return null
  const painel = await painelCredito(meses)
  const linha = painel?.linhas.find((l) => l.clienteId === clienteId)
  if (!painel || !linha) return null

  const supabase = await createClient()
  const [boletos, previstos, { data: auditoria }, { data: cliente }] = await Promise.all([
    carregarBoletos(supabase, clienteId),
    carregarPrevistos(supabase, clienteId),
    supabase
      .from('auditoria')
      .select('created_at, campos, motivo, criado_por')
      .eq('entidade', 'cliente')
      .eq('entidade_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('clientes')
      .select('atraso_liberado_em, atraso_liberado_motivo')
      .eq('id', clienteId)
      .maybeSingle(),
  ])

  type Campo = { campo: string; de: string | null; para: string | null }
  const linhasAud = (auditoria ?? []) as { created_at: string; campos: Campo[] | null; motivo: string | null; criado_por: string | null }[]
  const mudancas = linhasAud
    .map((a) => ({ a, c: (a.campos ?? []).find((x) => x.campo === 'Limite de crédito') }))
    .filter((x): x is { a: (typeof linhasAud)[number]; c: Campo } => !!x.c)

  const autores = [...new Set(mudancas.map((m) => m.a.criado_por).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (autores.length) {
    const { data: perfis } = await supabase.from('profiles').select('id, nome').in('id', autores)
    perfis?.forEach((p) => p.nome && nomes.set(p.id as string, p.nome as string))
  }

  return {
    ...linha,
    boletos: boletos.get(clienteId) ?? [],
    previstos,
    mudancasLimite: mudancas.map(({ a, c }) => ({
      data: a.created_at,
      de: c.de != null ? Number(c.de) : null,
      para: c.para != null ? Number(c.para) : null,
      motivo: a.motivo,
      autor: a.criado_por ? nomes.get(a.criado_por) ?? null : null,
    })),
    atrasoLiberadoEm: (cliente?.atraso_liberado_em as string | null) ?? null,
    atrasoLiberadoMotivo: (cliente?.atraso_liberado_motivo as string | null) ?? null,
  }
}
