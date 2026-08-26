'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function FiltroData({
  rota,
  etapaAtual,
  clienteAtual,
  deAtual,
  ateAtual,
}: {
  rota: string
  etapaAtual?: string
  clienteAtual?: string
  deAtual?: string
  ateAtual?: string
}) {
  const router = useRouter()
  const [de, setDe] = useState(deAtual ?? '')
  const [ate, setAte] = useState(ateAtual ?? '')

  function aplicar(novoDe: string, novoAte: string) {
    const params = new URLSearchParams()
    if (etapaAtual) params.set('etapa', etapaAtual)
    if (clienteAtual) params.set('cliente', clienteAtual)
    if (novoDe) params.set('de', novoDe)
    if (novoAte) params.set('ate', novoAte)
    const qs = params.toString()
    router.push(`${rota}${qs ? `?${qs}` : ''}`)
  }

  function limpar() {
    setDe('')
    setAte('')
    aplicar('', '')
  }

  const temFiltro = !!deAtual || !!ateAtual

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        <label className="block text-[9px] tracking-widest text-[#6E6E68] mb-1">
          DE
        </label>
        <input
          type="date"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          className="border border-[#DDDCD5] rounded-sm px-2.5 py-2 bg-white text-xs sm:text-sm outline-none focus:border-[#131A2E]"
        />
      </div>

      <div>
        <label className="block text-[9px] tracking-widest text-[#6E6E68] mb-1">
          ATÉ
        </label>
        <input
          type="date"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="border border-[#DDDCD5] rounded-sm px-2.5 py-2 bg-white text-xs sm:text-sm outline-none focus:border-[#131A2E]"
        />
      </div>

      <button
        onClick={() => aplicar(de, ate)}
        className="border border-[#131A2E] rounded-sm px-3 py-2 text-xs font-semibold tracking-wide text-[#131A2E] hover:bg-[#131A2E] hover:text-white"
      >
        FILTRAR
      </button>

      {temFiltro && (
        <button
          onClick={limpar}
          className="text-xs text-[#6E6E68] hover:text-[#B00063] px-1 py-2"
        >
          limpar
        </button>
      )}
    </div>
  )
}