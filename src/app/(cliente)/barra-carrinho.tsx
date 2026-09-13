'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCarrinho } from '@/lib/carrinho/contexto'
import LinkCarregando from '@/components/link-carregando'

/**
 * Atalho fixo para o carrinho, visível enquanto houver algo nele.
 *
 * A aba "Carrinho" no cabeçalho já mostra a contagem, mas o cabeçalho rola
 * para fora da tela num catálogo de 60 artes por página — quem adiciona a
 * quinta arte lá embaixo não tem para onde ir sem subir tudo de volta.
 *
 * Some na própria tela do carrinho, onde o atalho apontaria para a página
 * em que a pessoa já está.
 */
export default function BarraCarrinho() {
  const pathname = usePathname()
  const { itens, totalUnidades } = useCarrinho()

  if (itens.length === 0 || pathname.startsWith('/carrinho')) return null

  const artes = itens.length === 1 ? '1 arte' : `${itens.length} artes`
  const unidades = totalUnidades === 1 ? '1 unidade' : `${totalUnidades} unidades`

  return (
    <>
      {/* reserva o espaço da barra, senão ela cobre o rodapé da lista */}
      <div aria-hidden className="h-16" />

      <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
        <div className="max-w-3xl mx-auto px-5 pb-4">
          <Link
            href="/carrinho"
            className="pointer-events-auto flex items-center justify-between gap-3 bg-[#131A2E] text-white rounded-sm px-4 py-3 shadow-lg shadow-[#131A2E]/25"
          >
            <span className="text-xs text-white/70 truncate">
              {artes} · {unidades}
            </span>
            <span className="text-sm font-semibold tracking-wide whitespace-nowrap">
              VER CARRINHO ›
              <LinkCarregando className="ml-1.5 align-middle" />
            </span>
          </Link>
        </div>
      </div>
    </>
  )
}
