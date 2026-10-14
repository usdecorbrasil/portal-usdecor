'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Divisões do Estoque: insumos e despesas por nota. Despesas só para quem
 * vê valores. Tecido, capas e locais entram com os módulos novos.
 */
export default function AbasEstoque({ dono }: { dono: boolean }) {
  const caminho = usePathname()
  const abas = [
    { href: '/admin/estoque/suprimentos', label: 'Insumos', ativa: caminho.startsWith('/admin/estoque/suprimentos') },
    ...(dono ? [{ href: '/admin/estoque/despesas', label: 'Despesas e notas', ativa: caminho.startsWith('/admin/estoque/despesas') }] : []),
  ]
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mt-3 mb-5">
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={
            'shrink-0 rounded-full px-4 py-2 text-xs font-semibold border whitespace-nowrap ' +
            (a.ativa
              ? 'bg-[#131A2E] text-white border-[#131A2E]'
              : 'bg-white text-[#6E6E68] border-[#DDDCD5] hover:border-[#131A2E] hover:text-[#131A2E]')
          }
        >
          {a.label}
        </Link>
      ))}
    </div>
  )
}
