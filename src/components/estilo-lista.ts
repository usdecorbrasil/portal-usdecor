/**
 * Vocabulário visual das listas do painel.
 *
 * As telas eram cartões espaçados e coloridos; passaram a ser listas densas
 * com cabeçalho de colunas, do jeito que um sistema de gestão se apresenta.
 * A cor continua, mas como sinal (tarja lateral, etiqueta), não como fundo.
 *
 * Mantido como strings de classe, e não como componentes, porque cada tela
 * tem colunas próprias — o que precisa ser igual é a moldura, a densidade e
 * a tipografia.
 */

/** Moldura da lista inteira. */
export const CAIXA = 'border border-[#E4E3DC] rounded-sm bg-white overflow-hidden'

/** Faixa de títulos de coluna, no topo da lista. */
export const CABECALHO =
  'flex items-center gap-2 px-2.5 py-1 bg-[#FCFCFA] border-b border-[#EFEEE8] ' +
  'text-[8px] sm:text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]'

/** Container das linhas: elas se tocam, separadas por 1px. */
export const CORPO = 'divide-y divide-[#EFEEE8]'

/** Uma linha da lista. */
export const LINHA =
  'flex items-center gap-2 px-2.5 py-1.5 bg-white hover:bg-[#FAFAF8]'

/** Número, quantidade, valor — tudo que alinha em coluna. */
export const NUM = 'font-mono text-[11px] tabular-nums'

/** Nome principal da linha (cliente, coleção, arte). */
export const NOME = 'font-semibold tracking-tight text-sm truncate'

/** Etiqueta curta dentro da linha (status, aviso). */
export const ETIQUETA =
  'text-[9px] font-mono uppercase tracking-wider rounded-sm px-1 py-0.5 shrink-0'

/** Cabeçalho de um grupo acima da sua lista. */
export const TITULO_GRUPO =
  'flex items-center gap-2 px-2.5 py-1 border border-b-0 border-[#E4E3DC] ' +
  'bg-[#FCFCFA] rounded-t-sm text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6E68]'

/** Estado vazio, mais discreto que o antigo bloco de 16 de altura. */
export const VAZIO =
  'border border-dashed border-[#DDDCD5] rounded-sm py-10 text-center text-sm text-[#6E6E68]'
