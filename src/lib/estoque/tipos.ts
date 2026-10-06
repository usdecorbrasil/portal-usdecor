/** Tipos de movimento do estoque de tecido. Puro: usado no servidor e na tela. */
export const TIPOS_MOVIMENTO = ['entrada', 'consumo', 'quebra', 'ajuste'] as const
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number]
