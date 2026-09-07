'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ABAS = [
  { href: '/admin/financeiro/boletos', label: 'Boletos' },
  { href: '/admin/financeiro/custos', label: 'Custos' },
  { href: '/admin/financeiro/apuracao', label: 'Apuração' },
  { href: '/admin/financeiro/relatorios', label: 'Relatórios' },
]

export default function Abas({ children }: { children: React.ReactNode }) {
  const caminho = usePathname()

  return (
    <div className="mt-4">
      <div className="flex gap-1 overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
        {ABAS.map((a) => {
          const ativa = caminho.startsWith(a.href)

          return (
            <Link
              key={a.href}
              href={a.href}
              className={
                'shrink-0 border-2 border-b-0 rounded-t-lg px-4 py-2 text-sm whitespace-nowrap relative -mb-0.5 ' +
                (ativa
                  ? 'bg-[#F2F1ED] border-[#131A2E] text-[#131A2E] font-semibold z-10'
                  : 'bg-[#E4E3DD] border-[#DDDCD5] text-[#6E6E68] hover:text-[#131A2E]')
              }
            >
              {a.label}
            </Link>
          )
        })}
      </div>

      <div className="border-2 border-[#131A2E] rounded-b-sm rounded-tr-sm p-4 sm:p-5">
        {children}
      </div>
    </div>
  )
}
