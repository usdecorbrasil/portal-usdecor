/**
 * Casamento entre lançamentos do extrato e o que o portal tem lançado:
 * saída ↔ conta a pagar. Puro. (Entrada ↔ repasse de marketplace vem com o
 * módulo de pedidos.)
 *
 * Regra: valor igual (1 centavo de tolerância) é obrigatório; a data decide
 * a confiança — no banco, perto do vencimento ou da data de pagamento; na
 * fatura de cartão, perto da data da compra (a fatura mostra a compra, não o
 * vencimento). Nome do fornecedor na descrição desempata. Dois
 * candidatos igualmente bons não geram sugestão automática: a tela lista os
 * dois e a equipe escolhe.
 */
import type { LancamentoLido } from './tipos'

export type ContaCandidata = {
  id: string
  descricao: string
  fornecedor: string | null
  valor: number
  vencimento: string
  pagoEm: string | null
  dataCompra: string | null
  cartaoId: string | null
  parcela: number
  parcelas: number
}

export type Sugestao<T> = { candidato: T; pontos: number; motivo: string }
export type Certeza = 'alta' | 'media' | 'nenhuma'

const DIAS_BANCO = 7
const DIAS_CARTAO = 5

function dias(a: string, b: string): number {
  const [a1, a2, a3] = a.slice(0, 10).split('-').map(Number)
  const [b1, b2, b3] = b.slice(0, 10).split('-').map(Number)
  return Math.abs(Math.round((Date.UTC(a1, a2 - 1, a3) - Date.UTC(b1, b2 - 1, b3)) / 86400000))
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')

const PALAVRAS_VAZIAS = new Set(['ltda', 'me', 'epp', 'sa', 's', 'a', 'eireli', 'de', 'da', 'do', 'e', 'com', 'comercio', 'industria', 'pix', 'ted', 'doc', 'pagamento', 'pgto', 'transferencia', 'compra', 'cartao', 'debito', 'credito', 'boleto', 'titulo', 'enviado', 'recebido'])

/** Quantas palavras do nome aparecem na descrição do extrato (0 a 1). */
function afinidadeNome(nome: string | null | undefined, descricao: string): number {
  if (!nome) return 0
  const palavras = normalizar(nome).split(/\s+/).filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
  if (!palavras.length) return 0
  const d = normalizar(descricao)
  const achou = palavras.filter((p) => d.includes(p)).length
  return achou / palavras.length
}

const valorIgual = (a: number, b: number) => Math.abs(a - b) <= 0.011

/** Nº de parcela que a fatura de cartão imprime ("PARC 02/03", "2/3"). */
export function parcelaNaDescricao(descricao: string): { n: number; de: number } | null {
  const m = descricao.match(/(\d{1,2})\s*[\/|de]\s*(\d{1,2})/i)
  if (!m) return null
  const n = Number(m[1]), de = Number(m[2])
  return n >= 1 && de >= 1 && n <= de && de <= 36 ? { n, de } : null
}

export function sugerirConta(l: LancamentoLido, contas: ContaCandidata[], extrato: { tipo: 'banco' | 'cartao'; cartaoId: string | null }): { certeza: Certeza; sugestoes: Sugestao<ContaCandidata>[] } {
  const limite = extrato.tipo === 'cartao' ? DIAS_CARTAO : DIAS_BANCO
  const parc = extrato.tipo === 'cartao' ? parcelaNaDescricao(l.descricao) : null
  const sugestoes: Sugestao<ContaCandidata>[] = []
  for (const c of contas) {
    if (!valorIgual(c.valor, l.valor)) continue
    if (extrato.tipo === 'cartao' && extrato.cartaoId && c.cartaoId && c.cartaoId !== extrato.cartaoId) continue
    const referencias = extrato.tipo === 'cartao' ? [c.dataCompra, c.vencimento] : [c.pagoEm, c.vencimento, c.dataCompra]
    const d = Math.min(...referencias.filter(Boolean).map((r) => dias(l.data, r as string)))
    if (!Number.isFinite(d) || d > limite * 3) continue
    let pontos = 50 + Math.max(0, limite - d) * (40 / limite)
    const nome = afinidadeNome(c.fornecedor ?? c.descricao.split(' · ')[0], l.descricao)
    pontos += nome * 30
    if (parc && c.parcelas > 1) pontos += parc.n === c.parcela && parc.de === c.parcelas ? 20 : -30
    if (c.pagoEm && extrato.tipo === 'banco' && dias(l.data, c.pagoEm) <= 1) pontos += 10
    const motivo = [`mesmo valor`, d === 0 ? 'mesma data' : `${d} dia${d > 1 ? 's' : ''} de diferença`, nome >= 0.5 ? 'nome bate' : null].filter(Boolean).join(', ')
    sugestoes.push({ candidato: c, pontos: Math.round(pontos), motivo })
  }
  sugestoes.sort((a, b) => b.pontos - a.pontos)
  return { certeza: certezaDe(sugestoes), sugestoes: sugestoes.slice(0, 5) }
}


function certezaDe(s: { pontos: number }[]): Certeza {
  if (!s.length) return 'nenhuma'
  const [a, b] = s
  if (a.pontos >= 85 && (!b || a.pontos - b.pontos >= 15)) return 'alta'
  if (b && a.pontos - b.pontos < 5) return 'nenhuma'
  return 'media'
}
