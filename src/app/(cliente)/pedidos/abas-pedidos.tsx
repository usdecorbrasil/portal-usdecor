'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LinkCarregando from '@/components/link-carregando'

const ABAS = [
  { href: '/pedidos', label: 'Pedidos', exato: true },
  { href: '/pedidos/boletos', label: 'Boletos', exato: false },
]

/** Sub-abas da área de pedidos do cliente: a lista e as cobranças. */
export default function AbasPedidos() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b border-[#DDDCD5] mb-5">
      {ABAS.map((a) => {
        const ativa = a.exato
          ? pathname === a.href || /^\/pedidos\/[^/]+$/.test(pathname) && !pathname.startsWith('/pedidos/boletos')
          : pathname.startsWith(a.href)
        return (
          <Link
            key={a.href}
            href={a.href}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              ativa
                ? 'text-[#131A2E] border-[#131A2E] font-semibold'
                : 'text-[#6E6E68] border-transparent hover:text-[#131A2E]'
            }`}
          >
            {a.label}
            <LinkCarregando className="ml-1.5 align-middle" />
          </Link>
        )
      })}
    </div>
  )
}
