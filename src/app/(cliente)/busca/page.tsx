import Link from 'next/link'
import { buscarGeralCliente } from '@/app/actions/busca'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function BuscaClientePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const termo = (q ?? '').trim()

  const resultado = termo.length >= 2
    ? await buscarGeralCliente(termo)
    : { pedidos: [], artes: [] }

  const total = resultado.pedidos.length + resultado.artes.length

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Busca
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        {termo ? (
          <>
            {total} resultado{total !== 1 ? 's' : ''} para{' '}
            <strong className="text-[#131A2E]">&ldquo;{termo}&rdquo;</strong>
          </>
        ) : (
          'Digite ao menos 2 caracteres para buscar'
        )}
      </p>

      {termo.length >= 2 && total === 0 && (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
          <p className="text-sm text-[#6E6E68]">
            Nenhum resultado encontrado.
          </p>
        </div>
      )}

      {resultado.pedidos.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            PEDIDOS
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h2>
          <div className="space-y-2">
            {resultado.pedidos.map((p) => (
              <Link
                key={p.id}
                href={`/pedidos/${p.id}`}
                className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
              >
                <span className="font-mono text-xs text-[#6E6E68] flex-1">
                  Pedido #{p.numero}
                </span>
                <span className="font-mono font-semibold text-sm">
                  R$ {brl(p.total)}
                </span>
                <span className="text-[#DDDCD5]">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {resultado.artes.length > 0 && (
        <section>
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            ARTES NO SEU CATÁLOGO
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h2>
          <div className="space-y-2">
            {resultado.artes.map((a) => (
              <Link
                key={a.id}
                href={`/catalogo`}
                className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-[#6E6E68]">
                    {a.sku}
                  </span>
                  <h3 className="font-semibold tracking-tight truncate">
                    {a.nome}
                  </h3>
                </div>
                <span className="text-[#DDDCD5] ml-auto">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}