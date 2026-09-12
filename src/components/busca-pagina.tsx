'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Busca que filtra a própria página, sem sair dela.
 *
 * Fica ao lado do título e esconde, na hora, tudo que não bate com o texto
 * digitado. Convive com os filtros de URL da tela: primeiro o servidor filtra
 * (cliente, período, etapa), depois isto filtra por cima do que sobrou.
 *
 * A página marca o que é pesquisável com atributos, sem precisar virar
 * client component:
 *
 * - `data-busca="texto"` — item filtrável (o texto é o que será comparado;
 *   sem valor, usa o texto visível do elemento)
 * - `data-busca-grupo` — bloco que some quando nenhum item dentro dele bate
 * - `data-busca-contagem` — recebe a contagem de itens visíveis do grupo
 * - `data-busca-vazio` — só aparece quando a busca não encontrou nada
 */

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export default function BuscaPagina({
  placeholder = 'Filtrar nesta página...',
  rotulo = 'Filtrar nesta página',
}: {
  placeholder?: string
  rotulo?: string
}) {
  const [termo, setTermo] = useState('')
  const [encontrados, setEncontrados] = useState<number | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const escopo: HTMLElement =
      document.querySelector('main') ?? document.body

    // Nossas próprias alterações de texto disparam o observador; sem isso o
    // filtro se realimentaria em laço
    let aplicando = false

    function aplicar() {
      aplicando = true

      const termos = normalizar(termo).split(/\s+/).filter(Boolean)
      const filtrando = termos.length > 0

      const itens = Array.from(
        escopo.querySelectorAll<HTMLElement>('[data-busca]')
      )

      let visiveis = 0

      itens.forEach((el) => {
        const alvo = normalizar(el.dataset.busca || el.textContent || '')
        const bate = !filtrando || termos.every((t) => alvo.includes(t))
        el.style.display = bate ? '' : 'none'
        if (bate) visiveis++
      })

      escopo
        .querySelectorAll<HTMLElement>('[data-busca-grupo]')
        .forEach((grupo) => {
          const filhos = Array.from(
            grupo.querySelectorAll<HTMLElement>('[data-busca]')
          )
          const dentro = filhos.filter((e) => e.style.display !== 'none').length

          grupo.style.display =
            filtrando && filhos.length > 0 && dentro === 0 ? 'none' : ''

          grupo
            .querySelectorAll<HTMLElement>('[data-busca-contagem]')
            .forEach((c) => {
              if (c.dataset.buscaTotal === undefined) {
                c.dataset.buscaTotal = c.textContent ?? ''
              }
              c.textContent = filtrando
                ? String(dentro)
                : c.dataset.buscaTotal ?? ''
            })
        })

      escopo
        .querySelectorAll<HTMLElement>('[data-busca-vazio]')
        .forEach((el) => {
          el.style.display = filtrando && visiveis === 0 ? '' : 'none'
        })

      setEncontrados(filtrando ? visiveis : null)
      aplicando = false
    }

    aplicar()

    // A lista é renderizada no servidor: depois de um router.refresh() os
    // cartões voltam sem o filtro aplicado
    const observador = new MutationObserver(() => {
      if (!aplicando) aplicar()
    })
    observador.observe(escopo, { childList: true, subtree: true })

    return () => {
      observador.disconnect()

      escopo
        .querySelectorAll<HTMLElement>('[data-busca], [data-busca-grupo]')
        .forEach((el) => {
          el.style.display = ''
        })

      // O aviso de "nada encontrado" nasce escondido: devolver '' o mostraria
      escopo
        .querySelectorAll<HTMLElement>('[data-busca-vazio]')
        .forEach((el) => {
          el.style.display = 'none'
        })

      escopo
        .querySelectorAll<HTMLElement>('[data-busca-contagem]')
        .forEach((c) => {
          if (c.dataset.buscaTotal !== undefined) {
            c.textContent = c.dataset.buscaTotal
          }
        })
    }
  }, [termo])

  return (
    <div className="relative w-full sm:w-64">
      <label htmlFor="busca-pagina" className="sr-only">
        {rotulo}
      </label>

      <span
        aria-hidden
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#B8B7B0] pointer-events-none"
      >
        <Lupa />
      </span>

      <input
        id="busca-pagina"
        ref={campo}
        type="search"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTermo('')
            e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        className="w-full border border-[#DDDCD5] rounded-sm pl-8 pr-8 py-1.5 text-sm bg-white outline-none focus:border-[#131A2E]"
      />

      {termo && (
        <button
          type="button"
          onClick={() => {
            setTermo('')
            campo.current?.focus()
          }}
          aria-label="Limpar filtro da página"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#6E6E68] hover:text-[#131A2E]"
        >
          ✕
        </button>
      )}

      {encontrados !== null && (
        <p className="absolute left-0 top-full mt-1 text-[10px] font-mono tracking-wide text-[#6E6E68]">
          {encontrados === 0
            ? 'NADA ENCONTRADO NESTA PÁGINA'
            : encontrados + (encontrados === 1 ? ' RESULTADO' : ' RESULTADOS')}
        </p>
      )}
    </div>
  )
}

function Lupa() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
