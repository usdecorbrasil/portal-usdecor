'use client'

import Link from 'next/link'
import LinkCarregando from '@/components/link-carregando'

/**
 * Abas do painel. Client component só por causa do `useLinkStatus`, que dá
 * resposta imediata ao clique — o `loading.tsx` da área entra logo depois.
 */
export default function Abas({
  abas,
}: {
  abas: { href: string; label: string }[]
}) {
  return (
    <nav className="max-w-5xl mx-auto px-5 flex items-center overflow-x-auto">
      {abas.map((a, i) => (
        <div key={a.href} className="flex items-center shrink-0">
          {i > 0 && <span aria-hidden className="w-px h-4 bg-[#DDDCD5] shrink-0" />}
          <Link
            href={a.href}
            className="px-3 py-2.5 text-sm text-[#6E6E68] hover:text-[#131A2E] whitespace-nowrap inline-flex items-center gap-1.5"
          >
            {a.label}
            <LinkCarregando />
          </Link>
        </div>
      ))}
    </nav>
  )
}
