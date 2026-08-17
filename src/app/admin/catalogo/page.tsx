import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import NovoCatalogo from './novo-catalogo'
import EnviosPendentes from './envios-pendentes'

export default async function CatalogosPage() {
  const perfil = await lerPerfil()
  const dono = perfil?.papel === 'admin'

  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, ativo')
    .order('ativo', { ascending: false })
    .order('razao_social')

  const { data: catalogos } = await supabase
    .from('catalogos')
    .select('id, cliente_id, nome, descricao, ativo, produtos(id, ativo)')
    .order('ordem')
    .order('nome')

  // Envios de arte que ainda não foram processados
  const { data: envios } = await supabase
    .from('envios_arte')
    .select('id, cliente_id, link, observacoes, situacao, created_at, clientes(razao_social)')
    .in('situacao', ['recebido', 'em_analise'])
    .order('created_at', { ascending: false })

  const ativos = clientes?.filter((c) => c.ativo) ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Catálogos
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        Cada cliente pode ter várias coleções
      </p>

      <EnviosPendentes
        envios={((envios ?? []) as any[]).map((e) => ({
          id: e.id,
          cliente: e.clientes?.razao_social ?? '—',
          link: e.link,
          observacoes: e.observacoes,
          situacao: e.situacao,
          criadoEm: e.created_at,
        }))}
      />

      {dono && <NovoCatalogo clientes={ativos} />}

      <div className="mt-8 space-y-8">
        {clientes?.map((cliente) => {
          const meus = catalogos?.filter((k) => k.cliente_id === cliente.id) ?? []

          return (
            <section key={cliente.id}>
              <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#131A2E] pb-2 mb-3">
                <h2 className="font-semibold tracking-tight">
                  {cliente.razao_social}
                  {!cliente.ativo && (
                    <span className="ml-2 text-xs font-normal text-[#6E6E68]">
                      inativo
                    </span>
                  )}
                </h2>
                <span className="text-xs text-[#6E6E68] whitespace-nowrap">
                  {meus.length} coleç{meus.length === 1 ? 'ão' : 'ões'}
                </span>
              </div>

              {meus.length === 0 ? (
                <p className="text-sm text-[#6E6E68] py-3">
                  Nenhuma coleção.
                  {dono && ' Crie uma pelo botão acima.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {meus.map((k) => {
                    const artes = k.produtos ?? []
                    const artesAtivas = artes.filter((p) => p.ativo).length
                    const inativas = artes.length - artesAtivas

                    return (
                      <Link
                        key={k.id}
                        href={`/admin/catalogo/${k.id}`}
                        className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold tracking-tight">
                              {k.nome}
                            </h3>
                            {!k.ativo && (
                              <span className="text-xs bg-[#EAE9E3] text-[#6E6E68] px-1.5 py-0.5 rounded-sm">
                                arquivado
                              </span>
                            )}
                          </div>
                          {k.descricao && (
                            <p className="text-xs text-[#6E6E68] mt-0.5">
                              {k.descricao}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-[#6E6E68] mt-1">
                            <span>{artes.length} artes</span>
                            <span className="w-1 h-1 rounded-full bg-[#DDDCD5]" />
                            <span>{artesAtivas} ativas</span>
                            {inativas > 0 && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-[#DDDCD5]" />
                                <span className="text-[#C79600]">
                                  {inativas} aguardando
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-[#DDDCD5]">›</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}

        {(!clientes || clientes.length === 0) && (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm py-12 text-center">
            <p className="text-sm text-[#6E6E68]">
              Cadastre um cliente primeiro.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}