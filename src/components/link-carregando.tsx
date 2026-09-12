'use client'

import { useLinkStatus } from 'next/link'

/**
 * Pontinho que aparece no link enquanto a navegação está pendente.
 *
 * Precisa ser renderizado *dentro* de um `<Link>` — o `useLinkStatus` lê o
 * estado do link mais próximo. Serve para o clique dar resposta imediata,
 * antes mesmo de o `loading.tsx` da área entrar.
 */
export default function LinkCarregando({
  className = '',
}: {
  className?: string
}) {
  const { pending } = useLinkStatus()

  if (!pending) return null

  return (
    <span
      aria-hidden
      className={
        'inline-block w-1.5 h-1.5 rounded-full bg-current opacity-70 ' +
        'animate-[respira_1s_ease-in-out_infinite] ' +
        className
      }
    />
  )
}
