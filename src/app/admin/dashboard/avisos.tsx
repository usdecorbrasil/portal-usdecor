import Link from 'next/link'

/**
 * Avisos do dashboard num formato só (pedido do dono em 08/10/2026): uma
 * linha compacta por assunto, com a cor dizendo a urgência — tarja lateral e
 * título —, em duas colunas no computador. Antes cada aviso tinha um cartão
 * grande e um estilo próprio, e alguns ficavam soltos fora do bloco.
 */

export type NivelAviso = 'urgente' | 'atencao' | 'info'

export type Aviso = {
  nivel: NivelAviso
  titulo: string
  detalhe: string
  href: string
}

const ORDEM: Record<NivelAviso, number> = { urgente: 0, atencao: 1, info: 2 }

const COR: Record<NivelAviso, { tarja: string; titulo: string; fundo: string }> = {
  urgente: { tarja: 'bg-[#B00063]', titulo: 'text-[#B00063]', fundo: 'hover:bg-[#FFF6FA]' },
  atencao: { tarja: 'bg-[#C79600]', titulo: 'text-[#6B5320]', fundo: 'hover:bg-[#FFFBEE]' },
  info: { tarja: 'bg-[#0090D8]', titulo: 'text-[#131A2E]', fundo: 'hover:bg-[#F4FAFD]' },
}

export default function Avisos({ avisos }: { avisos: Aviso[] }) {
  if (!avisos.length) return null
  const lista = [...avisos].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel])
  const urgentes = lista.filter((a) => a.nivel === 'urgente').length

  return (
    <section className="mb-5">
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-2 flex items-center gap-2">
        AVISOS
        {urgentes > 0 && (
          <span className="font-mono normal-case tracking-normal text-[#B00063]">
            {urgentes} urgente{urgentes > 1 ? 's' : ''}
          </span>
        )}
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
        {lista.map((a) => {
          const cor = COR[a.nivel]
          return (
            <Link
              key={a.titulo}
              href={a.href}
              className={'relative flex items-center gap-2 bg-white border border-[#E4E3DC] rounded-sm pl-3.5 pr-2.5 py-2 ' + cor.fundo}
            >
              <span className={'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm ' + cor.tarja} />
              <span className="flex-1 min-w-0">
                <span className={'block font-semibold tracking-tight text-xs sm:text-[13px] leading-snug ' + cor.titulo}>{a.titulo}</span>
                <span className="block text-[11px] text-[#6E6E68] leading-snug mt-0.5 line-clamp-2">{a.detalhe}</span>
              </span>
              <span className="text-[#9B9A93] shrink-0">›</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
