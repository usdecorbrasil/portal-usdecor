'use client'

import { createContext, useContext, useMemo, useState } from 'react'

/**
 * Ponte entre a busca da página (que fica ao lado do título) e uma lista que
 * prefere filtrar sozinha.
 *
 * A `BuscaPagina` normalmente filtra o DOM por atributos, o que só alcança o
 * que está renderizado. Numa lista paginada isso limitaria a busca à página
 * atual. Com este provedor em volta, o campo apenas publica o texto e a lista
 * filtra a coleção inteira antes de paginar — a busca continua valendo para
 * todo o catálogo, não só para a página visível.
 */

type Busca = {
  termo: string
  definirTermo: (t: string) => void
  /** Quantos itens a lista encontrou; null quando não há busca ativa. */
  encontrados: number | null
  definirEncontrados: (n: number | null) => void
}

const Ctx = createContext<Busca | null>(null)

export function ProvedorBusca({ children }: { children: React.ReactNode }) {
  const [termo, definirTermo] = useState('')
  const [encontrados, definirEncontrados] = useState<number | null>(null)

  const valor = useMemo(
    () => ({ termo, definirTermo, encontrados, definirEncontrados }),
    [termo, encontrados]
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Null quando não há provedor — aí a busca volta a filtrar o DOM. */
export function useBusca() {
  return useContext(Ctx)
}

/** Mesma normalização da busca por atributos: sem acento, minúsculo. */
export function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function termosDe(termo: string) {
  return normalizar(termo).split(/\s+/).filter(Boolean)
}

/** Todos os termos precisam aparecer no alvo. */
export function casa(alvo: string, termos: string[]) {
  if (termos.length === 0) return true
  const a = normalizar(alvo)
  return termos.every((t) => a.includes(t))
}
