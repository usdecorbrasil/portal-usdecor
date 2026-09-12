'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

function escopoDaPagina(): HTMLElement {
  return document.querySelector('main') ?? document.body
}

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

  // O filtro roda tanto na digitação quanto no observador; ler o termo de um
  // ref evita recriar o observador (e refazer tudo) a cada tecla
  const termoRef = useRef('')

  const aplicar = useCallback(() => {
    const escopo = escopoDaPagina()
    const termos = normalizar(termoRef.current).split(/\s+/).filter(Boolean)
    const filtrando = termos.length > 0

    let visiveis = 0

    escopo.querySelectorAll<HTMLElement>('[data-busca]').forEach((el) => {
      const alvo = normalizar(el.dataset.busca || el.textContent || '')
      const bate = !filtrando || termos.every((t) => alvo.includes(t))
      const display = bate ? '' : 'none'
      if (el.style.display !== display) el.style.display = display
      if (bate) visiveis++
    })

    escopo
      .querySelectorAll<HTMLElement>('[data-busca-grupo]')
      .forEach((grupo) => {
        const filhos = Array.from(
          grupo.querySelectorAll<HTMLElement>('[data-busca]')
        )
        const dentro = filhos.filter((e) => e.style.display !== 'none').length

        const display =
          filtrando && filhos.length > 0 && dentro === 0 ? 'none' : ''
        if (grupo.style.display !== display) grupo.style.display = display

        grupo
          .querySelectorAll<HTMLElement>('[data-busca-contagem]')
          .forEach((c) => {
            if (c.dataset.buscaTotal === undefined) {
              c.dataset.buscaTotal = c.textContent ?? ''
            }
            const texto = filtrando
              ? String(dentro)
              : c.dataset.buscaTotal ?? ''
            // Só escreve quando muda: reescrever o mesmo texto ainda conta
            // como mutação e acordaria o observador de novo, em laço
            if (c.textContent !== texto) c.textContent = texto
          })
      })

    escopo.querySelectorAll<HTMLElement>('[data-busca-vazio]').forEach((el) => {
      const display = filtrando && visiveis === 0 ? '' : 'none'
      if (el.style.display !== display) el.style.display = display
    })

    setEncontrados(filtrando ? visiveis : null)
  }, [])

  // Filtra a cada mudança do termo
  useEffect(() => {
    termoRef.current = termo
    aplicar()
  }, [termo, aplicar])

  // A lista vem do servidor: depois de um router.refresh() os cartões voltam
  // sem o filtro aplicado, então é preciso reaplicar
  useEffect(() => {
    const escopo = escopoDaPagina()
    let agendado = 0

    const observador = new MutationObserver((registros) => {
      const externo = registros.some((r) => {
        const alvo = r.target
        const el =
          alvo.nodeType === Node.ELEMENT_NODE
            ? (alvo as HTMLElement)
            : alvo.parentElement
        // Ignora o que a própria busca escreve (contadores) e a sua UI
        return !el?.closest('[data-busca-ui], [data-busca-contagem]')
      })

      if (!externo || agendado) return

      agendado = requestAnimationFrame(() => {
        agendado = 0
        aplicar()
      })
    })

    observador.observe(escopo, { childList: true, subtree: true })

    return () => {
      if (agendado) cancelAnimationFrame(agendado)
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
  }, [aplicar])

  return (
    <div data-busca-ui className="relative w-full sm:w-64">
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
        className={
          'w-full border border-[#DDDCD5] rounded-sm pl-8 py-1.5 text-sm bg-white outline-none focus:border-[#131A2E] ' +
          (encontrados !== null ? 'pr-36' : 'pr-8')
        }
      />

      {/* Fica dentro da caixa do campo: posicionado abaixo dele, no celular
          o texto caía em cima da linha seguinte da página */}
      {encontrados !== null && (
        <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] font-mono tracking-wide text-[#6E6E68] pointer-events-none whitespace-nowrap">
          {encontrados === 0
            ? 'NENHUM RESULTADO'
            : encontrados + (encontrados === 1 ? ' RESULTADO' : ' RESULTADOS')}
        </span>
      )}

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
