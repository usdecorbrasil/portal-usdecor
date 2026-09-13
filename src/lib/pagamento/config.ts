/**
 * Regras de pagamento configuráveis pelo dono, em Configurações.
 *
 * Fica tudo numa chave só de `configuracoes` (`formas_pagamento`), guardada
 * como JSON: são cinco ajustes por forma de pagamento, e espalhar isso em
 * quinze linhas chave/valor tornaria cada leitura uma consulta diferente.
 *
 * Este arquivo é puro de propósito — sem Supabase, sem `server-only` — para
 * que o cálculo da taxa possa rodar também no carrinho, no navegador, e o
 * cliente ver o valor final antes de confirmar.
 */

export const FORMAS = ['boleto', 'cartao_credito', 'cartao_debito'] as const

export type Forma = (typeof FORMAS)[number]

export const ROTULOS_FORMA: Record<Forma, string> = {
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

export type ConfigForma = {
  /** Se desligada, a forma não aparece para o cliente no carrinho. */
  ativa: boolean
  /** 1 = só à vista. Teto de parcelas que o cliente pode escolher. */
  maxParcelas: number
  /** Abaixo disso o parcelamento é bloqueado, em reais. */
  valorMinimoParcela: number
  /** Somado ao pedido, em % do valor da mercadoria. */
  percentual: number
  /**
   * Somado ao pedido, em reais. No boleto é por documento emitido (multiplica
   * pelo número de parcelas); no cartão é por transação (cobra uma vez).
   */
  taxaFixa: number
  /** Dias entre parcelas. Só o boleto usa. */
  intervaloDias: number
}

export type ConfigPagamento = Record<Forma, ConfigForma>

/** Usado quando a chave ainda não existe no banco. */
export const PADRAO: ConfigPagamento = {
  boleto: {
    ativa: true,
    maxParcelas: 3,
    valorMinimoParcela: 200,
    percentual: 0,
    taxaFixa: 0,
    intervaloDias: 30,
  },
  cartao_credito: {
    ativa: true,
    maxParcelas: 6,
    valorMinimoParcela: 100,
    percentual: 0,
    taxaFixa: 0,
    intervaloDias: 30,
  },
  cartao_debito: {
    ativa: true,
    maxParcelas: 1,
    valorMinimoParcela: 0,
    percentual: 0,
    taxaFixa: 0,
    intervaloDias: 30,
  },
}

/** Aceita JSON parcial vindo do banco sem quebrar se faltar campo. */
export function normalizar(bruto: unknown): ConfigPagamento {
  const entrada = (bruto ?? {}) as Partial<Record<Forma, Partial<ConfigForma>>>

  const saida = {} as ConfigPagamento

  for (const forma of FORMAS) {
    const p = PADRAO[forma]
    const v = entrada[forma] ?? {}

    saida[forma] = {
      ativa: typeof v.ativa === 'boolean' ? v.ativa : p.ativa,
      maxParcelas: numero(v.maxParcelas, p.maxParcelas),
      valorMinimoParcela: numero(v.valorMinimoParcela, p.valorMinimoParcela),
      percentual: numero(v.percentual, p.percentual),
      taxaFixa: numero(v.taxaFixa, p.taxaFixa),
      intervaloDias: numero(v.intervaloDias, p.intervaloDias),
    }
  }

  // Débito é à vista por definição; parcelar aqui seria erro de digitação
  saida.cartao_debito.maxParcelas = 1

  return saida
}

function numero(v: unknown, padrao: number) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : padrao
}

/**
 * Quanto a forma de pagamento acrescenta ao valor da mercadoria.
 * Arredonda em centavos para não gerar dízima na divisão das parcelas.
 */
export function calcularTaxa(
  valorMercadoria: number,
  config: ConfigForma,
  parcelas: number,
  forma: Forma
): number {
  if (valorMercadoria <= 0) return 0

  const percentual = (valorMercadoria * config.percentual) / 100

  // Boleto se paga por documento; cartão, por transação
  const vezes = forma === 'boleto' ? Math.max(1, parcelas) : 1
  const fixa = config.taxaFixa * vezes

  return Math.round((percentual + fixa) * 100) / 100
}

/** Valor final que o cliente paga, já com a taxa da forma escolhida. */
export function totalComTaxa(
  valorMercadoria: number,
  config: ConfigForma,
  parcelas: number,
  forma: Forma
): number {
  return (
    Math.round(
      (valorMercadoria + calcularTaxa(valorMercadoria, config, parcelas, forma)) * 100
    ) / 100
  )
}

/**
 * Quantas parcelas o cliente pode escolher nesta forma, dado o valor.
 * Devolve lista vazia quando nem à vista é permitido (forma desligada).
 */
export function parcelasDisponiveis(
  valorMercadoria: number,
  config: ConfigForma,
  forma: Forma
): number[] {
  if (!config.ativa) return []

  const opcoes: number[] = []

  for (let n = 1; n <= Math.max(1, config.maxParcelas); n++) {
    // O mínimo vale para o parcelamento; à vista sempre é oferecida
    if (n > 1 && config.valorMinimoParcela > 0) {
      const total = totalComTaxa(valorMercadoria, config, n, forma)
      if (total / n < config.valorMinimoParcela) break
    }
    opcoes.push(n)
  }

  return opcoes
}

/* ------------------------- taxa de um pedido gravado ------------------------- */

/**
 * A taxa fica congelada no pedido (`taxa_pagamento_percentual` e
 * `taxa_pagamento_fixa`), e não é lida da configuração atual: mudar a taxa em
 * Configurações não pode alterar o que já foi cobrado de um pedido antigo.
 *
 * Espelha `valor_cobranca_pedido` no Postgres — se um mudar, o outro muda.
 */
export function taxaDoPedido(
  total: number,
  percentual: number,
  taxaFixa: number,
  formaPagamento: string,
  parcelas: number
): number {
  if (total <= 0) return 0

  // Boleto se paga por documento; cartão, por transação
  const documentos =
    formaPagamento === 'boleto_parcelado' ? Math.max(1, parcelas) : 1

  const percentualEmReais = Math.round(((total * percentual) / 100) * 100) / 100

  return Math.round((percentualEmReais + taxaFixa * documentos) * 100) / 100
}

/** Valor que o cliente paga: mercadoria + taxa da forma escolhida. */
export function valorCobranca(
  total: number,
  percentual: number,
  taxaFixa: number,
  formaPagamento: string,
  parcelas: number
): number {
  return (
    Math.round(
      (total + taxaDoPedido(total, percentual, taxaFixa, formaPagamento, parcelas)) * 100
    ) / 100
  )
}
