/**
 * Avaliação da forma de pagamento escolhida no Faturar.
 *
 * Puro de propósito (sem Supabase): roda no navegador, no bloco "Faturar
 * pedido" e no pop-up de confirmação, para mostrar parcelas, acréscimo, total
 * e os avisos **antes** de a RPC `admin_definir_forma_pagamento_faturamento`
 * decidir. A regra que vale é a do banco; aqui é o espelho dela — mexeu numa,
 * mexa na outra.
 */

import {
  MAX_PARCELAS,
  PRAZO_MAXIMO_BOLETO_AVISTA_DIAS,
  valorCobranca,
  type ConfigForma,
  type ConfigPagamento,
  type Forma,
} from './config'
import { hojeBrasilia } from '@/lib/datas'

export const FORMAS_FATURA = [
  'boleto_avista',
  'boleto_parcelado',
  'pix',
  'cartao_credito',
  'cartao_debito',
] as const

export type FormaFatura = (typeof FORMAS_FATURA)[number]

export const ROTULOS_FATURA: Record<FormaFatura, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

/** Bloco da configuração que vale para a forma (os dois boletos dividem um). */
export function chaveConfig(forma: string): Forma {
  return forma.startsWith('boleto') ? 'boleto' : (forma as Forma)
}

export function configDaForma(config: ConfigPagamento, forma: string): ConfigForma {
  return config[chaveConfig(forma)] ?? config.boleto
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Hoje em AAAA-MM-DD, no fuso de Brasília (o mesmo que o banco usa). */
export function hojeIso(): string {
  return hojeBrasilia()
}

/** Soma dias a uma data AAAA-MM-DD, sem fuso. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Divide o valor cobrado como `parcelar_pedido` faz: trunca em centavos e a
 * sobra do arredondamento cai na última parcela.
 */
export function dividirCobranca(cobranca: number, parcelas: number): number[] {
  const n = Math.max(1, parcelas)
  const base = Math.floor((cobranca / n) * 100) / 100
  const valores: number[] = []
  let soma = 0
  for (let i = 1; i <= n; i++) {
    const v = i < n ? base : Math.round((cobranca - soma) * 100) / 100
    valores.push(v)
    soma = Math.round((soma + v) * 100) / 100
  }
  return valores
}

export type ParcelaPrevista = {
  numero: number
  valor: number
  /** AAAA-MM-DD, ou null quando o vencimento não é definido aqui (Pix, cartão, boleto à vista). */
  vencimento: string | null
}

export type AvaliacaoFatura = {
  forma: string
  /** 1 = à vista. */
  parcelas: number
  mercadoria: number
  taxa: number
  totalCobrado: number
  parcelasPrevistas: ParcelaPrevista[]
  /** Impedem o faturamento: forma, mínimo, teto, permissão. */
  bloqueios: string[]
  /**
   * Limite de crédito: também impede, mas o dono pode liberar com motivo (ou
   * trocar a forma). Null quando não há problema de crédito.
   */
  credito: string | null
}

export function avaliarFatura({
  forma,
  parcelas,
  primeiroVencimento,
  mercadoria,
  config,
  permitidas,
  formaAtual,
  taxaCongelada,
  limite,
  emUso,
  liberado,
}: {
  forma: string
  parcelas: number
  primeiroVencimento: string
  mercadoria: number
  config: ConfigPagamento
  /** `clientes.formas_pagamento`; vazia = sem restrição. */
  permitidas: readonly string[]
  /** Forma já gravada no pedido (pedidos antigos), ou null. */
  formaAtual: string | null
  /** Taxa congelada no pedido; vale quando a forma não muda. */
  taxaCongelada: { percentual: number; fixa: number } | null
  limite: number
  /** Crédito em uso do cliente, sem este pedido. Null = desconhecido (não checa). */
  emUso: number | null
  /** `bloqueio_liberado_em` preenchido: o dono já liberou. */
  liberado: boolean
}): AvaliacaoFatura {
  const bloqueios: string[] = []
  let credito: string | null = null

  if (!forma) {
    return {
      forma,
      parcelas: 1,
      mercadoria,
      taxa: 0,
      totalCobrado: mercadoria,
      parcelasPrevistas: [],
      bloqueios: ['Escolha a forma de pagamento.'],
      credito: null,
    }
  }

  const cfg = configDaForma(config, forma)
  const parcelado = forma === 'boleto_parcelado' || forma === 'cartao_credito'
  const n = parcelado ? Math.max(1, parcelas) : 1

  if (!cfg.ativa) bloqueios.push('Esta forma está desativada em Configurações → Pagamento.')
  if (permitidas.length > 0 && !permitidas.includes(forma)) {
    bloqueios.push('Esta forma não está permitida para este cliente (cadastro do cliente → formas de pagamento).')
  }
  if (forma === 'boleto_parcelado' && n < 2) bloqueios.push('Boleto parcelado exige ao menos 2 parcelas.')

  const teto = Math.max(1, Math.min(cfg.maxParcelas, MAX_PARCELAS))
  if (n > teto) bloqueios.push(`Esta forma permite no máximo ${teto}x.`)

  // Se a forma não muda, vale a taxa já congelada no pedido; se muda, a da
  // configuração atual (é o que o gatilho vai congelar)
  const pct = formaAtual === forma && taxaCongelada ? taxaCongelada.percentual : cfg.percentual
  const fixa = formaAtual === forma && taxaCongelada ? taxaCongelada.fixa : cfg.taxaFixa

  const totalCobrado = valorCobranca(mercadoria, pct, fixa, forma, n)
  const taxa = Math.round((totalCobrado - mercadoria) * 100) / 100
  const valores = dividirCobranca(totalCobrado, n)

  const parcelasPrevistas: ParcelaPrevista[] = valores.map((v, i) => ({
    numero: i + 1,
    valor: v,
    vencimento:
      forma === 'boleto_parcelado' && primeiroVencimento
        ? somarDias(primeiroVencimento, i * cfg.intervaloDias)
        : forma === 'boleto_avista' && primeiroVencimento
        ? primeiroVencimento
        : null,
  }))

  // Parcela mínima pelo valor real
  if (mercadoria > 0 && cfg.valorMinimoParcela > 0) {
    const menor = Math.min(...valores)
    if (forma.startsWith('boleto') && menor < cfg.valorMinimoParcela) {
      bloqueios.push(
        `Cada boleto ficaria em R$ ${brl(menor)}, abaixo do mínimo de R$ ${brl(cfg.valorMinimoParcela)}. Escolha menos parcelas ou outra forma.`
      )
    }
    if (forma === 'cartao_credito' && n > 1 && menor < cfg.valorMinimoParcela) {
      bloqueios.push(
        `Cada parcela ficaria em R$ ${brl(menor)}, abaixo do mínimo de R$ ${brl(cfg.valorMinimoParcela)} do cartão. Escolha menos parcelas.`
      )
    }
  }

  if (forma === 'boleto_parcelado') {
    if (!primeiroVencimento) bloqueios.push('Informe o primeiro vencimento do boleto.')
    else if (primeiroVencimento < hojeIso()) bloqueios.push('O primeiro vencimento não pode ser no passado.')
  }

  // À vista: data escolhida por quem fatura, até o teto de dias corridos
  if (forma === 'boleto_avista' && primeiroVencimento) {
    const teto = somarDias(hojeIso(), PRAZO_MAXIMO_BOLETO_AVISTA_DIAS)
    if (primeiroVencimento < hojeIso()) bloqueios.push('O vencimento do boleto não pode ser no passado.')
    else if (primeiroVencimento > teto)
      bloqueios.push(`O boleto à vista pode vencer em no máximo ${PRAZO_MAXIMO_BOLETO_AVISTA_DIAS} dias (até ${teto.split('-').reverse().join('/')}).`)
  }

  // Limite de crédito: só boleto é conta a receber; liberação do dono dispensa
  if (forma.startsWith('boleto') && !liberado && emUso !== null) {
    if (forma === 'boleto_parcelado' && !(limite > 0 && limite - emUso > 0)) {
      credito =
        limite > 0
          ? `Boleto parcelado indisponível: o limite de crédito de R$ ${brl(limite)} está tomado (R$ ${brl(emUso)} já em boletos).`
          : 'Boleto parcelado indisponível: o cliente não tem limite de crédito definido.'
    } else if (limite > 0 && emUso + totalCobrado > limite) {
      credito = `Este pedido passa do limite de crédito: R$ ${brl(emUso)} em boletos + R$ ${brl(totalCobrado)} deste pedido, com limite de R$ ${brl(limite)}.`
    }
  }

  return { forma, parcelas: n, mercadoria, taxa, totalCobrado, parcelasPrevistas, bloqueios, credito }
}
