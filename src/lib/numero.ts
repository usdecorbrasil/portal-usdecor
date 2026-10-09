/**
 * Lê número digitado do jeito brasileiro. Puro: serve no navegador e no
 * servidor. Antes cada tela tinha um jeito: umas só trocavam a vírgula
 * ("10.000,00" virava NaN), outras tiravam todos os pontos ("1.5" virava 15).
 *
 *   "1.234,56" → 1234.56     "10.000" → 10000     "1,5" → 1.5
 *   "1.5"      → 1.5         "R$ 900" → 900       ""    → NaN
 *
 * Regra: com vírgula, ela é o decimal e os pontos são milhar. Sem vírgula,
 * mais de um ponto é milhar; um ponto só é milhar quando vem seguido de
 * exatamente três dígitos ("1.500" = mil e quinhentos), senão é decimal.
 * Devolve NaN quando não é número — quem chama decide o que fazer.
 */
export function paraNumeroBr(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v
  let s = String(v ?? '').replace(/R\$|\s/g, '')
  if (!s) return NaN
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN
}
