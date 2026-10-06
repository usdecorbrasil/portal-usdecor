'use client'

import { useState } from 'react'

/** Linha digitável do boleto com botão de copiar. */
export default function LinhaDigitavel({ linha }: { linha: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linha)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="font-mono text-[11px] text-[#6E6E68] truncate select-all">{linha}</code>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 border border-[#DDDCD5] rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#131A2E] hover:border-[#131A2E]"
      >
        {copiado ? 'COPIADO' : 'COPIAR'}
      </button>
    </div>
  )
}
