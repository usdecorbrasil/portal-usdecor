'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCarrinho } from '@/lib/carrinho/contexto'

const ABAS = [
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/carrinho', label: 'Carrinho' },
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/conta', label: 'Minha conta' },
]

export default function Navegacao() {
  const pathname = usePathname()
  const { itens } = useCarrinho()

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
                ? 'text-[#131A2E] border-[#D8007A] font-medium'
                : 'text-[#6E6E68] border-transparent hover:text-[#131A2E]'
            }`}
          >
            {a.label}
            {mostrarBadge && (
              <span
                className="ml-1.5 inline-flex items-center justify-center bg-[#D8007A] text-white text-[10px] font-mono font-semibold rounded-full px-1.5 min-w-[18px] h-[18px] align-middle"
                title={`${itens.length} unidades`}
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