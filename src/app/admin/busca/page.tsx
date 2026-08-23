import Link from 'next/link'
import { redirect } from 'next/navigation'
import { lerPerfil } from '@/lib/auth/perfil'
import { buscarGeral } from '@/app/actions/busca'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatarCnpj(c: string) {
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const perfil = await lerPerfil()

  if (!perfil || perfil.papel === 'cliente') redirect('/')

  const termo = (q ?? '').trim()
  const resultado = termo.length >= 2
    ? await buscarGeral(termo)
    : { pedidos: [], clientes: [], artes: [] }

  const total =
    resultado.pedidos.length + resultado.clientes.length + resultado.artes.length

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
                href={`/admin/pedidos/${p.id}`}
                className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-[#6E6E68]">
                    #{p.numero}
                  </span>
                  <h3 className="font-semibold tracking-tight truncate">
                    {p.clienteNome}
                  </h3>
                </div>
                {p.total !== null && (
                  <span className="font-mono font-semibold text-sm shrink-0">
                    R$ {brl(p.total)}
                  </span>
                )}
                <span className="text-[#DDDCD5] shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {resultado.clientes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            CLIENTES
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h2>
          <div className="space-y-2">
            {resultado.clientes.map((c) => (
              <Link
                key={c.id}
                href={`/admin/clientes/${c.id}`}
                className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold tracking-tight truncate">
                    {c.razaoSocial}
                  </h3>
                  <p className="text-xs text-[#6E6E68] mt-0.5 font-mono">
                    {formatarCnpj(c.cnpj)}
                  </p>
                  <p className="text-xs text-[#6E6E68]">{c.email}</p>
                </div>
                <span className="text-[#DDDCD5] shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {resultado.artes.length > 0 && (
        <section>
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            ARTES
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h2>
          <div className="space-y-2">
            {resultado.artes.map((a) => (
              <Link
                key={a.id}
                href={`/admin/catalogo/${a.catalogoId}`}
                className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-[#6E6E68]">
                    {a.sku}
                  </span>
                  <h3 className="font-semibold tracking-tight truncate">
                    {a.nome}
                  </h3>
                  <p className="text-xs text-[#6E6E68]">{a.clienteNome}</p>
                </div>
                <span className="text-[#DDDCD5] shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}