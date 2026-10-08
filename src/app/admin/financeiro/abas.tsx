'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ABAS = [
  { href: '/admin/financeiro/boletos', label: 'Boletos' },
  { href: '/admin/financeiro/credito', label: 'Crédito' },
  { href: '/admin/financeiro/custos', label: 'Custos' },
  { href: '/admin/financeiro/apuracao', label: 'Apuração' },
  { href: '/admin/financeiro/relatorios', label: 'Relatórios' },
]

export default function Abas({ children }: { children: React.ReactNode }) {
  const caminho = usePathname()

  return (
    <div className="mt-4">
      {/* Sem sangria lateral: as abas precisam terminar onde o painel
          termina, senão passam da borda e a última fica fora da tela */}
      <div className="flex gap-0.5 sm:gap-1">
        {ABAS.map((a) => {
          const ativa = caminho.startsWith(a.href)

          return (
            <Link
              key={a.href}
              href={a.href}
              className={
                'min-w-0 flex-1 text-center border-2 border-b-0 rounded-t-lg ' +
                'px-1.5 sm:px-4 py-2 text-xs sm:text-sm truncate relative -mb-0.5 ' +
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
