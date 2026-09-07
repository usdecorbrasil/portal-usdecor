'use client'

import { useState } from 'react'

/**
 * Mantém os filtros fora do caminho até serem pedidos. Já vem aberto
 * quando há filtro ativo — senão o usuário não veria o que está filtrando.
 */
export default function FiltrosRecolhiveis({
  temFiltroAtivo = false,
  children,
}: {
  temFiltroAtivo?: boolean
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(temFiltroAtivo)

  return (
    <div className="mb-4">
      <button
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex items-center gap-2 border rounded-sm px-3 py-2 text-xs font-semibold tracking-wide ${
          temFiltroAtivo
            ? 'bg-[#131A2E] text-white border-[#131A2E]'
            : 'bg-white text-[#6E6E68] border-[#DDDCD5] hover:border-[#131A2E] hover:text-[#131A2E]'
        }`}
      >
        FILTROS
        {temFiltroAtivo && <span className="text-[10px]">• ativo</span>}
        <span
          className={`text-[10px] transition-transform ${
            aberto ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>

      {aberto && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-3">
          {children}
        </div>
      )}
    </div>
  )
}
