/** Tipos de movimento do estoque de tecido. Puro: usado no servidor e na tela. */
export const TIPOS_MOVIMENTO = ['entrada', 'consumo', 'quebra', 'ajuste'] as const
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number]

/** Situações de um envio de tecido: enviado (aguarda conferência) → conferido | recusado. */
export const SITUACOES_ENVIO = ['enviado', 'conferido', 'recusado'] as const
export type SituacaoEnvio = (typeof SITUACOES_ENVIO)[number]

export const ROTULO_SITUACAO_ENVIO: Record<SituacaoEnvio, { rotulo: string; cor: string }> = {
  enviado: { rotulo: 'Aguardando conferência', cor: 'bg-[#FBF0D9] text-[#C79600]' },
  conferido: { rotulo: 'Conferido', cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  recusado: { rotulo: 'Recusado', cor: 'bg-[#FBEAF0] text-[#B00063]' },
}
