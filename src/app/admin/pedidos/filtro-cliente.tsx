'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Cliente = { id: string; razao_social: string }

export default function FiltroCliente({
  clientes,
  clienteAtual,
  etapaAtual,
}: {
  clientes: Cliente[]
  clienteAtual?: string
  etapaAtual?: string
}) {
  const router = useRouter()
  const caixa = useRef<HTMLDivElement>(null)
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const clienteSelecionado = clientes.find((c) => c.id === clienteAtual)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false)
        setBusca('')
      }
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter((c) =>
      c.razao_social.toLowerCase().includes(termo)
    )
  }, [busca, clientes])

  function selecionar(clienteId: string) {
    const params = new URLSearchParams()
    if (etapaAtual) params.set('etapa', etapaAtual)
    if (clienteId) params.set('cliente', clienteId)
    const qs = params.toString()
    router.push(`/admin/pedidos${qs ? `?${qs}` : ''}`)
    setAberto(false)
    setBusca('')
  }

  return (
    <div>
      <label className="block text-[9px] tracking-widest text-[#6E6E68] mb-1">
        CLIENTE
      </label>
      <div ref={caixa} className="relative w-full sm:w-56">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="w-full flex items-center justify-between gap-2 border border-[#DDDCD5] rounded-sm px-2.5 py-2 bg-white text-xs sm:text-sm text-left hover:border-[#131A2E]"
        >
          <span className={clienteSelecionado ? 'text-[#131A2E]' : 'text-[#6E6E68]'}>
            {clienteSelecionado?.razao_social ?? 'Todos'}
          </span>
          <span className="text-[#6E6E68] shrink-0">▾</span>
        </button>

        {aberto && (
          <div className="absolute left-0 right-0 mt-1 bg-white border border-[#DDDCD5] rounded-sm shadow-lg z-50">
            <div className="p-2 border-b border-[#DDDCD5]">
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full border border-[#DDDCD5] rounded-sm px-2.5 py-1.5 text-sm outline-none focus:border-[#131A2E]"
              />
            </div>

            <div className="max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => selecionar('')}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAF7] ${
                  !clienteAtual ? 'font-semibold text-[#131A2E]' : 'text-[#6E6E68]'
                }`}
              >
                Todos os clientes
              </button>

              {filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionar(c.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#FAFAF7] truncate ${
                    c.id === clienteAtual
                      ? 'font-semibold text-[#131A2E] bg-[#FAFAF7]'
                      : 'text-[#131A2E]'
                  }`}
                >
                  {c.razao_social}
                </button>
              ))}

              {filtrados.length === 0 && (
                <p className="text-xs text-[#6E6E68] px-3 py-3">
                  Nenhum cliente encontrado.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}