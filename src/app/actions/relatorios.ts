'use server'

import { createClient } from '@/lib/supabase/server'
import { ROTULOS_STATUS } from '@/app/admin/financeiro/(abas)/relatorios/rotulos'

export type LinhaPedido = {
  id: string
  numero: number
  cliente: string
  status: string
  statusLabel: string
  criadoEm: string
  metragem: number
  unidades: number
  total: number
  cancelado: boolean
  motivoCancelamento: string | null
  reimpressoes: number
}

export type LinhaCliente = {
  clienteId: string
  cliente: string
  pedidos: number
  metragem: number
  total: number
}

export type LinhaArte = {
  sku: string
  nome: string
  unidades: number
  pedidos: number
}

export type LinhaAjuste = {
  numero: number
  cliente: string
  sku: string
  de: number
  para: number
  motivo: string
  data: string
}

export type LinhaParcela = {
  pedidoId: string
  numero: number
  cliente: string
  parcela: string
  valor: number
  vencimento: string
  pagoEm: string | null
  situacao: 'paga' | 'vencida' | 'aberta'
}

export type Relatorio = {
  pedidos: LinhaPedido[]
  parcelas: LinhaParcela[]
  resumoParcelas: {
    total: number
    recebido: number
    aReceber: number
    vencido: number
    qtdVencidas: number
  }
  porStatus: { status: string; label: string; quantidade: number; total: number }[]
  porCliente: LinhaCliente[]
  artes: LinhaArte[]
  ajustes: LinhaAjuste[]
  resumo: {
    pedidos: number
    faturamento: number
    metragem: number
    unidades: number
    ticketMedio: number
    cancelados: number
    valorCancelado: number
    reimpressoes: number
  }
}

function statusAtual(hist: { status: string; created_at: string }[]) {
  const ultimo = (hist ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
  return ultimo?.status ?? 'aguardando'
}

export async function gerarRelatorio(filtros: {
  de: string
  ate: string
  status?: string
  clienteId?: string
}): Promise<Relatorio> {
  const supabase = await createClient()

  let consulta = supabase
    .from('pedidos')
    .select(`
      id, numero, total, created_at, cancelado_em, cancelado_motivo,
      metragem_impressa, cliente_id,
      clientes(razao_social),
      pedido_status_historico(status, created_at, reimpressao_motivo),
      pedido_itens(id, sku, nome, quantidade_faturada),
      pedido_ajustes(item_id, quantidade_de, quantidade_para, motivo, created_at)
    `)
    .gte('created_at', `${filtros.de}T00:00:00`)
    .lte('created_at', `${filtros.ate}T23:59:59`)
    .order('created_at', { ascending: false })

  if (filtros.clienteId) {
    consulta = consulta.eq('cliente_id', filtros.clienteId)
  }

  // Parcelas são filtradas por vencimento: é a data que importa na cobrança
  let consultaParcelas = supabase
    .from('pedido_parcelas')
    .select(`
      numero, valor, vencimento, pago_em,
      pedidos!inner(id, numero, cliente_id, cancelado_em, clientes(razao_social))
    `)
    .gte('vencimento', filtros.de)
    .lte('vencimento', filtros.ate)
    .is('pedidos.cancelado_em', null)
    .order('vencimento')

  if (filtros.clienteId) {
    consultaParcelas = consultaParcelas.eq('pedidos.cliente_id', filtros.clienteId)
  }

  const [{ data: brutos, error }, { data: brutasParcelas }] = await Promise.all([
    consulta,
    consultaParcelas,
  ])

  if (error) {
    throw new Error(`Não foi possível gerar o relatório: ${error.message}`)
  }

  const inicioHoje = new Date(new Date().toDateString())

  const parcelas: LinhaParcela[] = ((brutasParcelas ?? []) as any[]).map((p) => {
    const vencida = !p.pago_em && new Date(p.vencimento) < inicioHoje
    return {
      pedidoId: p.pedidos?.id ?? '',
      numero: Number(p.pedidos?.numero ?? 0),
      cliente: p.pedidos?.clientes?.razao_social ?? '—',
      parcela: String(p.numero),
      valor: Number(p.valor),
      vencimento: p.vencimento as string,
      pagoEm: (p.pago_em as string) ?? null,
      situacao: p.pago_em ? 'paga' : vencida ? 'vencida' : 'aberta',
    }
  })

  const resumoParcelas = {
    total: parcelas.reduce((a, p) => a + p.valor, 0),
    recebido: parcelas
      .filter((p) => p.situacao === 'paga')
      .reduce((a, p) => a + p.valor, 0),
    aReceber: parcelas
      .filter((p) => p.situacao !== 'paga')
      .reduce((a, p) => a + p.valor, 0),
    vencido: parcelas
      .filter((p) => p.situacao === 'vencida')
      .reduce((a, p) => a + p.valor, 0),
    qtdVencidas: parcelas.filter((p) => p.situacao === 'vencida').length,
  }

  const todos = ((brutos ?? []) as any[]).map((p) => {
    const status = statusAtual(p.pedido_status_historico)
    const itens = (p.pedido_itens ?? []) as any[]

    return {
      id: p.id as string,
      numero: Number(p.numero),
      clienteId: p.cliente_id as string,
      cliente: p.clientes?.razao_social ?? '—',
      status,
      statusLabel: ROTULOS_STATUS[status] ?? status,
      criadoEm: p.created_at as string,
      metragem: p.metragem_impressa != null ? Number(p.metragem_impressa) : 0,
      unidades: itens.reduce(
        (a: number, i: any) => a + Number(i.quantidade_faturada),
        0
      ),
      total: Number(p.total),
      cancelado: !!p.cancelado_em,
      motivoCancelamento: (p.cancelado_motivo as string) ?? null,
      reimpressoes: (p.pedido_status_historico ?? []).filter(
        (h: any) => h.reimpressao_motivo
      ).length,
      itens,
      ajustesBrutos: (p.pedido_ajustes ?? []) as any[],
    }
  })

  // O filtro de status roda aqui porque o status vem do histórico,
  // não de uma coluna da tabela
  const filtrados = filtros.status
    ? todos.filter((p) =>
        filtros.status === 'cancelado'
          ? p.cancelado
          : p.status === filtros.status && !p.cancelado
      )
    : todos

  const validos = filtrados.filter((p) => !p.cancelado)
  const cancelados = filtrados.filter((p) => p.cancelado)

  // Cancelados nunca entram no faturamento
  const faturamento = validos.reduce((a, p) => a + p.total, 0)
  const metragem = validos.reduce((a, p) => a + p.metragem, 0)
  const unidades = validos.reduce((a, p) => a + p.unidades, 0)

  const porStatusMapa = new Map<string, { quantidade: number; total: number }>()
  for (const p of validos) {
    const atual = porStatusMapa.get(p.status) ?? { quantidade: 0, total: 0 }
    porStatusMapa.set(p.status, {
      quantidade: atual.quantidade + 1,
      total: atual.total + p.total,
    })
  }

  const porClienteMapa = new Map<string, LinhaCliente>()
  for (const p of validos) {
    const atual = porClienteMapa.get(p.clienteId) ?? {
      clienteId: p.clienteId,
      cliente: p.cliente,
      pedidos: 0,
      metragem: 0,
      total: 0,
    }
    atual.pedidos += 1
    atual.metragem += p.metragem
    atual.total += p.total
    porClienteMapa.set(p.clienteId, atual)
  }

  const artesMapa = new Map<string, LinhaArte>()
  for (const p of validos) {
    for (const i of p.itens) {
      const atual = artesMapa.get(i.sku) ?? {
        sku: i.sku,
        nome: i.nome,
        unidades: 0,
        pedidos: 0,
      }
      atual.unidades += Number(i.quantidade_faturada)
      atual.pedidos += 1
      artesMapa.set(i.sku, atual)
    }
  }

  const ajustes: LinhaAjuste[] = []
  for (const p of filtrados) {
    for (const a of p.ajustesBrutos) {
      const item = p.itens.find((i: any) => i.id === a.item_id)
      ajustes.push({
        numero: p.numero,
        cliente: p.cliente,
        sku: item?.sku ?? '—',
        de: Number(a.quantidade_de),
        para: Number(a.quantidade_para),
        motivo: a.motivo,
        data: a.created_at,
      })
    }
  }

  return {
    parcelas,
    resumoParcelas,

    pedidos: filtrados.map((p) => ({
      id: p.id,
      numero: p.numero,
      cliente: p.cliente,
      status: p.status,
      statusLabel: p.cancelado ? 'Cancelado' : p.statusLabel,
      criadoEm: p.criadoEm,
      metragem: p.metragem,
      unidades: p.unidades,
      total: p.total,
      cancelado: p.cancelado,
      motivoCancelamento: p.motivoCancelamento,
      reimpressoes: p.reimpressoes,
    })),

    porStatus: [...porStatusMapa.entries()]
      .map(([status, v]) => ({
        status,
        label: ROTULOS_STATUS[status] ?? status,
        quantidade: v.quantidade,
        total: v.total,
      }))
      .sort((a, b) => b.quantidade - a.quantidade),

    porCliente: [...porClienteMapa.values()].sort((a, b) => b.total - a.total),

    artes: [...artesMapa.values()]
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 20),

    ajustes: ajustes.sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
    ),

    resumo: {
      pedidos: validos.length,
      faturamento,
      metragem,
      unidades,
      ticketMedio: validos.length > 0 ? faturamento / validos.length : 0,
      cancelados: cancelados.length,
      valorCancelado: cancelados.reduce((a, p) => a + p.total, 0),
      reimpressoes: validos.reduce((a, p) => a + p.reimpressoes, 0),
    },
  }
}
