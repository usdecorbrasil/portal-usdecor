'use client'

import { useEffect } from 'react'

/**
 * Ao focar um campo numérico, seleciona o conteúdo — digitar substitui o
 * valor inteiro, sem precisar apagar. Vale para todo campo numérico do
 * sistema, inclusive os que vierem a ser criados.
 */
const SELETOR = [
  'input[type="number"]',
  'input[inputmode="numeric"]',
  'input[inputmode="decimal"]',
].join(', ')

function ehNumerico(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.matches(SELETOR)
}

export default function SelecionarAoFocar() {
  useEffect(() => {
    // O clique reposiciona o cursor depois do foco e desfaz a seleção.
    // Guardamos que o campo acabou de ser focado para re-selecionar no
    // mouseup, que é quando o navegador já terminou de posicionar o cursor.
    let recemFocado: HTMLInputElement | null = null

    function aoFocar(e: FocusEvent) {
      if (!ehNumerico(e.target)) return
      recemFocado = e.target
      e.target.select()
    }

    function aoSoltarMouse(e: MouseEvent) {
      if (!ehNumerico(e.target) || e.target !== recemFocado) return
      recemFocado = null
      e.preventDefault()
      e.target.select()
    }

    function aoSair() {
      recemFocado = null
    }

    document.addEventListener('focusin', aoFocar)
    document.addEventListener('mouseup', aoSoltarMouse)
    document.addEventListener('focusout', aoSair)

    return () => {
      document.removeEventListener('focusin', aoFocar)
      document.removeEventListener('mouseup', aoSoltarMouse)
      document.removeEventListener('focusout', aoSair)
    }
  }, [])

  return null
}
