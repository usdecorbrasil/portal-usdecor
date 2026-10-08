'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ROTULOS_STATUS } from './rotulos'

type Cliente = { id: string; razao_social: string }

const ATALHOS = [
  { label: 'Este mês', meses: 0 },
  { label: 'Mês passado', meses: 1 },
  { label: 'Últimos 3 meses', meses: 3 },
  { label: 'Este ano', ano: true },
]

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function FiltrosRelatorio({
  clientes,
  de,
  ate,
  status,
  clienteId,
}: {
  clientes: Cliente[]
  de: string
  ate: string
  status?: string
  clienteId?: string
}) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)

  function aplicar(novo: Partial<Record<string, string>>) {
    const p = new URLSearchParams()
    p.set('de', novo.de ?? de)
    p.set('ate', novo.ate ?? ate)

    const s = novo.status !== undefined ? novo.status : status
    const c = novo.cliente !== undefined ? novo.cliente : clienteId
    if (s) p.set('status', s)
    if (c) p.set('cliente', c)

    setCarregando(true)
    router.push(`/admin/financeiro/relatorios?${p.toString()}`)
  }

  function atalho(a: (typeof ATALHOS)[number]) {
    const hoje = new Date()

    if (a.ano) {
      return aplicar({
        de: iso(new Date(hoje.getFullYear(), 0, 1)),
        ate: iso(hoje),
      })
    }

    if (a.meses === 0) {
      return aplicar({
        de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
        ate: iso(hoje),
      })
    }

    if (a.meses === 1) {
      return aplicar({
        de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      })
    }

    return aplicar({
      de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - (a.meses ?? 3), 1)),
      ate: iso(hoje),
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ATALHOS.map((a) => (
          <button
            key={a.label}
            onClick={() => atalho(a)}
            className="border border-[#DDDCD5] rounded-full px-3 py-1.5 text-xs text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
            DE
          </label>
          <input
            type="date"
            value={de}
            onChange={(e) => aplicar({ de: e.target.value })}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
          />
        </div>

        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
            ATÉ
          </label>
          <input
            type="date"
            value={ate}
            onChange={(e) => aplicar({ ate: e.target.value })}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
          />
        </div>

        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
            STATUS
          </label>
          <select
            value={status ?? ''}
            onChange={(e) => aplicar({ status: e.target.value })}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]"
          >
            <option value="">Todos</option>
            {Object.entries(ROTULOS_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
            <option value="cancelado">Cancelados</option>
          </select>
        </div>

        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
            CLIENTE
          </label>
          <select
            value={clienteId ?? ''}
            onChange={(e) => aplicar({ cliente: e.target.value })}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]"
          >
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
      </div>

      {carregando && (
        <p className="text-xs text-[#6E6E68] mt-3">Gerando relatório...</p>
      )}
    </div>
  )
}
