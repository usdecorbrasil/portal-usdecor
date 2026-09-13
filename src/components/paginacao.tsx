'use client'

/**
 * Paginação de listas longas. Mostra primeira e última página sempre, e uma
 * janela em volta da atual — com muitas páginas, a lista de números não pode
 * estourar a largura do celular.
 *
 * A partir de `MIN_PAGINAS_VER_TUDO` páginas aparece o "ver tudo", que troca
 * para uma página só com o catálogo inteiro. Quando o catálogo é grande,
 * folhear de 50 em 50 atrapalha mais do que ajuda.
 */

/** A partir de quantas páginas vale oferecer o catálogo inteiro de uma vez. */
const MIN_PAGINAS_VER_TUDO = 3

function janelaDePaginas(atual: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const perto = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total)
  const paginas: (number | '…')[] = [1]

  if (perto[0] > 2) paginas.push('…')
  paginas.push(...perto)
  if (perto[perto.length - 1] < total - 1) paginas.push('…')
  paginas.push(total)

  return paginas
}

export default function Paginacao({
  pagina,
  totalPaginas,
  aoMudar,
  legenda,
  verTudo = false,
  aoAlternarVerTudo,
}: {
  pagina: number
  totalPaginas: number
  aoMudar: (p: number) => void
  /** Ex.: "25–48 de 137 artes" */
  legenda?: string
  /** Quando true, a lista já está mostrando tudo numa página só. */
  verTudo?: boolean
  /** Sem isto, o botão "ver tudo" não aparece. */
  aoAlternarVerTudo?: () => void
}) {
  if (totalPaginas <= 1 && !verTudo) return null

  const botao =
    'min-w-8 h-8 px-2 rounded-sm border text-xs font-mono tabular-nums disabled:opacity-35 disabled:cursor-default'

  const botaoTexto =
    'h-8 px-2.5 rounded-sm border border-[#DDDCD5] bg-white text-[10px] font-semibold tracking-wide ' +
    'text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]'

  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-3 border-t border-[#EFEEE8]"
    >
      {legenda && (
        <p className="text-[11px] font-mono text-[#9B9A93] tabular-nums">
          {legenda}
        </p>
      )}

      <div className="flex items-center gap-1 ml-auto">
        {verTudo ? (
          <button type="button" onClick={aoAlternarVerTudo} className={botaoTexto}>
            VER POR PÁGINAS
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => aoMudar(pagina - 1)}
              disabled={pagina <= 1}
              aria-label="Página anterior"
              className={botao + ' bg-white border-[#DDDCD5] text-[#6E6E68]'}
            >
              ‹
            </button>

            {janelaDePaginas(pagina, totalPaginas).map((p, i) =>
              p === '…' ? (
                <span
                  key={'sep' + i}
                  aria-hidden
                  className="px-1 text-xs text-[#B8B7B0]"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => aoMudar(p)}
                  aria-label={'Página ' + p}
                  aria-current={p === pagina ? 'page' : undefined}
                  className={
                    botao +
                    (p === pagina
                      ? ' bg-[#131A2E] border-[#131A2E] text-white'
                      : ' bg-white border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]')
                  }
                >
                  {p}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => aoMudar(pagina + 1)}
              disabled={pagina >= totalPaginas}
              aria-label="Próxima página"
              className={botao + ' bg-white border-[#DDDCD5] text-[#6E6E68]'}
            >
              ›
            </button>

            {aoAlternarVerTudo && totalPaginas > MIN_PAGINAS_VER_TUDO && (
              <button
                type="button"
                onClick={aoAlternarVerTudo}
                className={botaoTexto + ' ml-1.5'}
              >
                VER TUDO
              </button>
            )}
          </>
        )}
      </div>
    </nav>
  )
}
