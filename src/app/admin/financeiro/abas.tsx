'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Abas do Financeiro em dois cards (pedido do dono em 08/10/2026):
 *  - Contas: A receber (o antigo Boletos) e A pagar;
 *  - Custos, Apuração e Relatórios.
 * O conteúdo da aba aberta aparece dentro do card dela; o outro card mostra
 * só as abas, fechado. O Crédito segue num card próprio, abaixo dos dois.
 */

type Aba = { href: string; label: string }

const CARDS: { titulo: string; abas: Aba[] }[] = [
  {
    titulo: 'Contas',
    abas: [
      { href: '/admin/financeiro/a-receber', label: 'A receber' },
      { href: '/admin/financeiro/a-pagar', label: 'A pagar' },
    ],
  },
  {
    titulo: 'Custos e resultados',
    abas: [
      { href: '/admin/financeiro/custos', label: 'Custos' },
      { href: '/admin/financeiro/apuracao', label: 'Apuração' },
      { href: '/admin/financeiro/relatorios', label: 'Relatórios' },
    ],
  },
]

export default function Abas({ children }: { children: React.ReactNode }) {
  const caminho = usePathname()

  return (
    <div>
      {CARDS.map((card) => {
        const ativa = card.abas.find((a) => caminho.startsWith(a.href))
        return (
          <section key={card.titulo} className="mt-4">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#6E6E68] mb-1.5">{card.titulo}</h2>
            {/* Sem sangria lateral: as abas precisam terminar onde o painel
                termina, senão passam da borda e a última fica fora da tela */}
            <div className="flex gap-0.5 sm:gap-1">
              {card.abas.map((a) => {
                const aberta = a === ativa
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={
                      'min-w-0 flex-1 text-center border-2 rounded-t-lg ' +
                      'px-1.5 sm:px-4 py-2 text-xs sm:text-sm truncate relative ' +
                      // Só a aba aberta desce sobre a borda da caixa (e a apaga
                      // com o próprio fundo); as outras param em cima dela, para a
                      // linha da caixa continuar visível embaixo delas
                      (aberta ? 'border-b-0 -mb-0.5 ' : ativa ? 'border-b-0 ' : 'rounded-b-lg ') +
                      (aberta
                        ? 'bg-[#F2F1ED] border-[#131A2E] text-[#131A2E] font-semibold z-10'
                        : 'bg-[#E4E3DD] border-[#DDDCD5] text-[#6E6E68] hover:text-[#131A2E]')
                    }
                  >
                    {a.label}
                  </Link>
                )
              })}
            </div>

            {ativa && (
              <div className="border-2 border-[#131A2E] rounded-b-sm rounded-tr-sm p-4 sm:p-5">
                {children}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
