/**
 * Score de crédito do cliente — regra pura, sem Supabase, para rodar no
 * servidor e no navegador e para ser lida de ponta a ponta.
 *
 * Três partes, somando no máximo 100:
 *   - Pontualidade (−50 a +50): como o cliente pagou os boletos que já
 *     venceram. Pago em dia soma; pago com atraso ou vencido em aberto
 *     DESCONTA (decidido em 08/10/2026): o atraso tem de pesar contra, não
 *     só render menos.
 *   - Volume (0–30): quanto faturou no período, comparado ao maior cliente.
 *   - Frequência (0–20): quantos pedidos fez no período.
 * Boleto vencido e ainda aberto desconta mais 10 pontos cada (até 30).
 * O score final fica entre 0 e 100.
 *
 * A sugestão de limite sai do score e do uso do limite. É sugestão: quem
 * decide é o dono, e a mudança continua exigindo motivo.
 */

export type BoletoHistorico = {
  pedidoId: string
  pedidoNumero: number
  parcela: string
  valor: number
  /** AAAA-MM-DD */
  vencimento: string
  pagoEm: string | null
}

export type EntradaScore = {
  boletos: BoletoHistorico[]
  /** Faturamento (mercadoria) do cliente no período. */
  faturamento: number
  /** Maior faturamento entre todos os clientes no mesmo período. */
  maiorFaturamento: number
  pedidos: number
  meses: number
  limite: number
  emUso: number
  /** Só para a sugestão: dia de referência (AAAA-MM-DD). */
  hoje: string
}

export type Classe = 'excelente' | 'bom' | 'atencao' | 'risco' | 'sem_historico'

export type Sugestao = {
  acao: 'aumentar' | 'manter' | 'reduzir' | 'definir'
  limiteSugerido: number
  motivo: string
}

export type ResultadoScore = {
  score: number
  classe: Classe
  pontualidade: number
  volume: number
  frequencia: number
  penalidade: number
  /** Boletos vencidos e ainda abertos. */
  vencidosAbertos: number
  /** Maior atraso em dias entre os boletos vencidos abertos. */
  maiorAtrasoAberto: number
  /** Boletos já vencidos (pagos ou não) considerados na pontualidade. Pontualidade vai de −50 a +50. */
  boletosAvaliados: number
  pagosEmDia: number
  pagosComAtraso: number
  /** Atraso médio, em dias, dos boletos pagos com atraso. */
  atrasoMedio: number
  sugestao: Sugestao
}

export const ROTULO_CLASSE: Record<Classe, string> = {
  excelente: 'Excelente',
  bom: 'Bom',
  atencao: 'Atenção',
  risco: 'Risco',
  sem_historico: 'Sem histórico',
}

export const COR_CLASSE: Record<Classe, string> = {
  excelente: 'bg-[#E3F0E8] text-[#2E7D4F]',
  bom: 'bg-[#E6EDEE] text-[#0090D8]',
  atencao: 'bg-[#FBF0D9] text-[#8A6A00]',
  risco: 'bg-[#FBEAF0] text-[#B00063]',
  sem_historico: 'bg-[#EEEDE7] text-[#6E6E68]',
}

export const ROTULO_ACAO: Record<Sugestao['acao'], string> = {
  aumentar: 'Aumentar',
  manter: 'Manter',
  reduzir: 'Reduzir',
  definir: 'Definir',
}

const DIA = 86_400_000

function dias(de: string, ate: string): number {
  return Math.round((Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))) / DIA)
}

/**
 * Nota de um boleto já vencido, de −1 a +1. Em dia vale +1; atrasado vale
 * negativo, pior quanto maior o atraso; vencido sem pagar é o pior caso.
 */
function notaBoleto(b: BoletoHistorico, hoje: string): number | null {
  if (!b.pagoEm) {
    // Ainda não venceu: não conta
    return dias(b.vencimento, hoje) > 0 ? -1 : null
  }
  const atraso = dias(b.vencimento, b.pagoEm)
  if (atraso <= 0) return 1
  if (atraso <= 7) return -0.3
  if (atraso <= 30) return -0.6
  return -1
}

/** Arredonda para cima em múltiplos de R$ 100. */
function redondo(v: number): number {
  return Math.ceil(v / 100) * 100
}

export function calcularScore(e: EntradaScore): ResultadoScore {
  const avaliados = e.boletos
    .map((b) => ({ b, nota: notaBoleto(b, e.hoje) }))
    .filter((x): x is { b: BoletoHistorico; nota: number } => x.nota !== null)

  const pagos = avaliados.filter((x) => x.b.pagoEm)
  const pagosEmDia = pagos.filter((x) => x.nota === 1).length
  const atrasados = pagos.filter((x) => x.nota < 1)
  const atrasoMedio = atrasados.length
    ? Math.round(
        atrasados.reduce((s, x) => s + dias(x.b.vencimento, x.b.pagoEm as string), 0) /
          atrasados.length
      )
    : 0

  const vencidos = avaliados.filter((x) => !x.b.pagoEm)
  const maiorAtrasoAberto = vencidos.reduce(
    (m, x) => Math.max(m, dias(x.b.vencimento, e.hoje)),
    0
  )

  const semHistorico = avaliados.length === 0
  const pontualidade = semHistorico
    ? 25
    : Math.round((avaliados.reduce((s, x) => s + x.nota, 0) / avaliados.length) * 50)

  const volume =
    e.maiorFaturamento > 0
      ? Math.round(Math.sqrt(Math.min(1, e.faturamento / e.maiorFaturamento)) * 30)
      : 0

  const alvoPedidos = Math.max(4, Math.round(e.meses * 0.75))
  const frequencia = Math.round(Math.min(1, e.pedidos / alvoPedidos) * 20)

  const penalidade = Math.min(30, vencidos.length * 10)

  const score = Math.max(0, Math.min(100, pontualidade + volume + frequencia - penalidade))

  const classe: Classe =
    semHistorico && e.pedidos === 0
      ? 'sem_historico'
      : score >= 80
      ? 'excelente'
      : score >= 60
      ? 'bom'
      : score >= 40
      ? 'atencao'
      : 'risco'

  return {
    score,
    classe,
    pontualidade,
    volume,
    frequencia,
    penalidade,
    vencidosAbertos: vencidos.length,
    maiorAtrasoAberto,
    boletosAvaliados: avaliados.length,
    pagosEmDia,
    pagosComAtraso: atrasados.length,
    atrasoMedio,
    sugestao: sugerirLimite(e, score, classe, vencidos.length, maiorAtrasoAberto),
  }
}

function sugerirLimite(
  e: EntradaScore,
  score: number,
  classe: Classe,
  vencidosAbertos: number,
  maiorAtrasoAberto: number
): Sugestao {
  const mediaMensal = e.meses > 0 ? e.faturamento / e.meses : 0
  const uso = e.limite > 0 ? e.emUso / e.limite : 0

  if (maiorAtrasoAberto > 30) {
    const novo = Math.max(redondo(e.emUso), redondo(e.limite * 0.75))
    return {
      acao: e.limite > 0 && novo < e.limite ? 'reduzir' : 'manter',
      limiteSugerido: e.limite > 0 ? novo : 0,
      motivo: `Boleto vencido há ${maiorAtrasoAberto} dias sem pagamento.`,
    }
  }

  if (classe === 'sem_historico') {
    return { acao: 'manter', limiteSugerido: e.limite, motivo: 'Sem pedidos nem boletos no período.' }
  }

  if (e.limite === 0) {
    if (score >= 60 && mediaMensal > 0) {
      return {
        acao: 'definir',
        limiteSugerido: redondo(mediaMensal * 2),
        motivo: `Sem limite definido; paga em dia e fatura R$ ${mediaMensal.toFixed(0)}/mês em média.`,
      }
    }
    return { acao: 'manter', limiteSugerido: 0, motivo: 'Sem limite; ainda sem histórico suficiente para sugerir um.' }
  }

  if (score < 40) {
    return {
      acao: 'reduzir',
      limiteSugerido: Math.max(redondo(e.emUso), redondo(e.limite * 0.75)),
      motivo: vencidosAbertos > 0 ? 'Score baixo com boleto vencido em aberto.' : 'Score baixo: atrasos recorrentes ou pouco movimento.',
    }
  }

  if (score >= 80 && uso >= 0.6) {
    return {
      acao: 'aumentar',
      limiteSugerido: Math.max(redondo(e.limite * 1.25), redondo(mediaMensal * 2)),
      motivo: `Score ${score} com ${Math.round(uso * 100)}% do limite em uso.`,
    }
  }

  return {
    acao: 'manter',
    limiteSugerido: e.limite,
    motivo:
      score >= 80
        ? `Score ${score}, mas só ${Math.round(uso * 100)}% do limite em uso.`
        : `Score ${score}: desempenho regular.`,
  }
}
