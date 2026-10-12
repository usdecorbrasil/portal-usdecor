/** Um lançamento de extrato, como sai do OFX ou da leitura por IA. Puro. */
export type LancamentoLido = {
  /** AAAA-MM-DD */
  data: string
  descricao: string
  /** Sempre positivo; o sentido vai em `tipo`. */
  valor: number
  tipo: 'entrada' | 'saida'
  /** Nº do documento, FITID do OFX, etc. */
  documento: string | null
}

export type ExtratoLido = {
  tipo: 'banco' | 'cartao'
  origem: string | null
  periodoInicio: string | null
  periodoFim: string | null
  lancamentos: LancamentoLido[]
}
