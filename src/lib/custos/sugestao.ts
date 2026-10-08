/**
 * Custo por metro impresso a partir das compras de suprimentos.
 *
 * Puro (sem Supabase), para rodar no servidor e no navegador. Recebe as
 * entradas de estoque com custo (vindas das notas) e devolve o custo médio
 * ponderado de papel e tinta no período, já convertido para o que a aba
 * Custos usa: R$ por metro de papel impresso e R$ por litro de tinta.
 *
 * - Papel: custo médio do metro de papel comprado no período, usado direto
 *   como custo por metro impresso. Exige o papel cadastrado em metros
 *   (unidade "m").
 * - Tinta: custo médio por litro (unidade L ou mL). O coeficiente de consumo
 *   (mL por metro) vem do cadastro dos suprimentos de tinta, somado quando há
 *   várias cores; sem ele, a tela mantém o que já está em Custos.
 */

export type EntradaCompra = {
  suprimento: string
  categoria: string | null
  unidade: string
  quantidade: number
  custoTotal: number
  /** AAAA-MM-DD */
  data: string
  consumoPorMetro: number | null
}

export type SugestaoPapel = {
  /** R$ por metro de papel comprado (média ponderada do período). */
  custoMedioMetro: number
  compras: number
  metrosComprados: number
  avisos: string[]
}

export type SugestaoTinta = {
  /** R$ por litro (média ponderada do período). */
  custoMedioLitro: number
  /** mL por metro impresso, soma das cores cadastradas; null quando ninguém tem coeficiente. */
  consumoMlPorMetro: number | null
  compras: number
  litrosComprados: number
  avisos: string[]
}

export type SugestaoCustos = {
  janelaDias: number
  de: string
  papel: SugestaoPapel | null
  tinta: SugestaoTinta | null
}

const ehPapel = (c: string | null) => !!c && /papel/i.test(c)
const ehTinta = (c: string | null) => !!c && /tinta/i.test(c)

function litros(unidade: string, qtd: number): number | null {
  const u = unidade.trim().toLowerCase()
  if (u === 'l') return qtd
  if (u === 'ml') return qtd / 1000
  return null
}

function mlPorMetro(unidade: string, consumo: number): number | null {
  const u = unidade.trim().toLowerCase()
  if (u === 'l') return consumo * 1000
  if (u === 'ml') return consumo
  return null
}

const r2 = (v: number) => Math.round(v * 100) / 100
const r4 = (v: number) => Math.round(v * 10000) / 10000

export function sugerirCustos(entradas: EntradaCompra[], janelaDias: number, de: string): SugestaoCustos {
  // ---- papel
  const papelTodos = entradas.filter((e) => ehPapel(e.categoria))
  const papelMetros = papelTodos.filter((e) => e.unidade.trim().toLowerCase() === 'm' && e.quantidade > 0)
  let papel: SugestaoPapel | null = null
  if (papelMetros.length) {
    const metros = papelMetros.reduce((s, e) => s + e.quantidade, 0)
    const custo = papelMetros.reduce((s, e) => s + e.custoTotal, 0)
    const custoMedioMetro = r2(custo / metros)
    const avisos: string[] = []
    const fora = papelTodos.length - papelMetros.length
    if (fora > 0) avisos.push(`${fora} compra${fora > 1 ? 's' : ''} de papel ficou fora da conta por não estar em metros (cadastre o papel na unidade "m").`)
    papel = {
      custoMedioMetro,
      compras: papelMetros.length,
      metrosComprados: metros,
      avisos,
    }
  }

  // ---- tinta
  const tintaTodos = entradas.filter((e) => ehTinta(e.categoria))
  const tintaConv = tintaTodos
    .map((e) => ({ e, l: litros(e.unidade, e.quantidade) }))
    .filter((x): x is { e: EntradaCompra; l: number } => x.l !== null && x.l > 0)
  let tinta: SugestaoTinta | null = null
  if (tintaConv.length) {
    const l = tintaConv.reduce((s, x) => s + x.l, 0)
    const custo = tintaConv.reduce((s, x) => s + x.e.custoTotal, 0)
    // Coeficiente: soma do consumo cadastrado de cada tinta (uma por cor), em mL/m
    const porSuprimento = new Map<string, number>()
    for (const { e } of tintaConv) {
      const ml = e.consumoPorMetro ? mlPorMetro(e.unidade, e.consumoPorMetro) : null
      if (ml != null && ml > 0) porSuprimento.set(e.suprimento, ml)
    }
    const consumoMlPorMetro = porSuprimento.size ? r4([...porSuprimento.values()].reduce((s, v) => s + v, 0)) : null
    const avisos: string[] = []
    if (consumoMlPorMetro == null) avisos.push('Nenhuma tinta tem "consumo por metro" cadastrado: o coeficiente (mL/m) continua o que está em Custos.')
    const fora = tintaTodos.length - tintaConv.length
    if (fora > 0) avisos.push(`${fora} compra${fora > 1 ? 's' : ''} de tinta ficou fora da conta por não estar em L ou mL.`)
    tinta = {
      custoMedioLitro: r2(custo / l),
      consumoMlPorMetro,
      compras: tintaConv.length,
      litrosComprados: r4(l),
      avisos,
    }
  }

  return { janelaDias, de, papel, tinta }
}
