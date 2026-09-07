/** Custo de tinta por metro: (ml/m ÷ 1000) × R$/litro */
export function custoTintaPorMetro(
  tintaPorLitro: number,
  consumoMlPorMetro: number
) {
  return (consumoMlPorMetro / 1000) * tintaPorLitro
}

export type Custos = {
  papelPorMetro: number
  tintaPorLitro: number
  consumoMlPorMetro: number
  calandraPorMetro: number
  atualizadoEm: string | null
}
