'use client'

import Link from 'next/link'

export const TIPOS = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'sku', label: 'Artes / SKU' },
] as const

export type TipoRelatorio = (typeof TIPOS)[number]['id']

export default function SeletorTipo({
  atual,
  parametros,
}: {
  atual: TipoRelatorio
  parametros: Record<string, string | undefined>
}) {
  function href(tipo: string) {
    const p = new URLSearchParams()
    Object.entries(parametros).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    p.set('tipo', tipo)
    return `/admin/financeiro/relatorios?${p.toString()}`
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {TIPOS.map((t) => (
        <Link
          key={t.id}
          href={href(t.id)}
          className={
            'shrink-0 rounded-full px-4 py-2 text-xs font-semibold border whitespace-nowrap ' +
            (atual === t.id
              ? 'bg-[#131A2E] text-white border-[#131A2E]'
              : 'bg-white text-[#6E6E68] border-[#DDDCD5] hover:border-[#131A2E] hover:text-[#131A2E]')
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
