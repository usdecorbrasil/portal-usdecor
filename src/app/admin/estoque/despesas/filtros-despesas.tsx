'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm outline-none focus:border-[#131A2E] bg-white'

export default function FiltrosDespesas({
  de,
  ate,
  categoriaId,
  categorias,
}: {
  de: string
  ate: string
  categoriaId?: string
  categorias: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)

  function aplicar(novo: { de?: string; ate?: string; categoria?: string }) {
    const p = new URLSearchParams()
    p.set('de', novo.de ?? de)
    p.set('ate', novo.ate ?? ate)
    const c = novo.categoria !== undefined ? novo.categoria : categoriaId
    if (c) p.set('categoria', c)
    setCarregando(true)
    router.push(`/admin/estoque/despesas?${p.toString()}`)
  }

  const hoje = new Date()
  const atalhos = [
    { label: 'Este mês', de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) },
    { label: 'Mês passado', de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) },
    { label: 'Últimos 3 meses', de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)), ate: iso(hoje) },
    { label: 'Este ano', de: iso(new Date(hoje.getFullYear(), 0, 1)), ate: iso(hoje) },
  ]

  return (
    <div className={'flex flex-wrap items-end gap-2 ' + (carregando ? 'opacity-60' : '')}>
      <div className="flex gap-1.5 flex-wrap">
        {atalhos.map((a) => (
          <button
            key={a.label}
            onClick={() => aplicar({ de: a.de, ate: a.ate })}
            className={
              'rounded-full px-3 py-1.5 text-xs border ' +
              (a.de === de && a.ate === ate ? 'bg-[#131A2E] text-white border-[#131A2E]' : 'bg-white text-[#6E6E68] border-[#DDDCD5]')
            }
          >
            {a.label}
          </button>
        ))}
      </div>
      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
        DE
        <input type="date" defaultValue={de} onChange={(e) => e.target.value && aplicar({ de: e.target.value })} className={campo + ' block mt-0.5'} />
      </label>
      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
        ATÉ
        <input type="date" defaultValue={ate} onChange={(e) => e.target.value && aplicar({ ate: e.target.value })} className={campo + ' block mt-0.5'} />
      </label>
      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
        CATEGORIA
        <select value={categoriaId ?? ''} onChange={(e) => aplicar({ categoria: e.target.value })} className={campo + ' block mt-0.5'}>
          <option value="">todas</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
    </div>
  )
}
