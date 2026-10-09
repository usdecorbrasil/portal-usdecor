/**
 * "Hoje" no fuso de Brasília, em AAAA-MM-DD. Puro: serve no navegador e no
 * servidor. O servidor da Vercel e o banco rodam em UTC, então
 * `new Date().toISOString().slice(0, 10)` já é "amanhã" a partir das 21h —
 * um vencimento ou pagamento "de hoje" à noite era recusado ou caía no dia
 * errado. O banco usa a mesma referência (`hoje_brasilia()`).
 */
const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hojeBrasilia(agora: Date = new Date()): string {
  return FORMATO.format(agora)
}
