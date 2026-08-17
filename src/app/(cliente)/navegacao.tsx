'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCarrinho } from '@/lib/carrinho/contexto'

const ABAS = [
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/carrinho', label: 'Carrinho' },
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/artes', label: 'Artes' },
]

export default function Navegacao() {
  const pathname = usePathname()
  const { itens, totalUnidades } = useCarrinho()

  return (
    <nav className="max-w-3xl mx-auto px-5 flex gap-1 overflow-x-auto">
      {ABAS.map((a) => {
        const ativa = pathname.startsWith(a.href)
        const mostrarBadge = a.href === '/carrinho' && itens.length > 0

        return (
          <Link
            key={a.href}
            href={a.href}
            className={`relative px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
              ativa
                ? 'text-[#131A2E] border-[#B00063] font-medium'
                : 'text-[#6E6E68] border-transparent hover:text-[#131A2E]'
            }`}
          >
            {a.label}
            {mostrarBadge && (
              <span
                className="ml-1.5 inline-flex items-center justify-center bg-[#B00063] text-white text-[10px] font-mono font-semibold rounded-full px-1.5 min-w-[18px] h-[18px] align-middle"
                title={`${totalUnidades} unidades`}
              >
                {itens.length}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}