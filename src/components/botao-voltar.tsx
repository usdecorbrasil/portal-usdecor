import Link from 'next/link'

/** Botão de retorno, com a mesma aparência em todas as telas de detalhe */
export default function BotaoVoltar({
  href,
  rotulo,
}: {
  href: string
  rotulo: string
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 text-xs font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E] mb-1"
    >
      <span className="text-sm leading-none">←</span>
      {rotulo}
    </Link>
  )
}
