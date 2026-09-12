import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import NovoCatalogo from './novo-catalogo'
import EnviosPendentes from './envios-pendentes'
import BuscaPagina from '@/components/busca-pagina'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME } from '@/components/estilo-lista'

export default async function CatalogosPage() {
  const perfil = await lerPerfil()
  const nivelAdmin = perfil?.papel === 'admin' || perfil?.papel === 'financeiro'

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
    .select(`
      id, cliente_id, link, observacoes, situacao, created_at,
      clientes(razao_social),
      envio_arte_arquivos(nome, tamanho_bytes)
    `)
    .in('situacao', ['recebido', 'em_analise'])
    .order('created_at', { ascending: false })

  const ativos = clientes?.filter((c) => c.ativo) ?? []

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Catálogos
        </h1>
        <BuscaPagina
          placeholder="Filtrar por cliente ou coleção..."
          rotulo="Filtrar os catálogos desta página"
        />
      </div>
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
          arquivos: (e.envio_arte_arquivos ?? []).map((a: any) => ({
            nome: a.nome,
            tamanhoBytes: Number(a.tamanho_bytes),
          })),
        }))}
      />

      {nivelAdmin && <NovoCatalogo clientes={ativos} />}

      <div className="mt-8 space-y-5">
        {clientes?.map((cliente) => {
          const meus = catalogos?.filter((k) => k.cliente_id === cliente.id) ?? []

          return (
            <section key={cliente.id} data-busca-grupo>
              <div className="flex items-center justify-between gap-3 px-2.5 py-1 border border-b-0 border-[#E4E3DC] bg-[#FCFCFA] rounded-t-sm">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6E68] truncate">
                  {cliente.razao_social}
                  {!cliente.ativo && (
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-[#9B9A93]">
                      inativo
                    </span>
                  )}
                </h2>
                <span
                  data-busca-contagem
                  className="font-mono text-[11px] text-[#9B9A93] whitespace-nowrap tabular-nums"
                >
                  {meus.length}
                </span>
              </div>

              {meus.length === 0 ? (
                <p className="text-xs text-[#6E6E68] border border-[#E4E3DC] rounded-b-sm px-2.5 py-3 bg-white">
                  Nenhuma coleção.
                  {nivelAdmin && ' Crie uma pelo botão acima.'}
                </p>
              ) : (
                <div className={CAIXA + ' rounded-t-none'}>
                  <div className={CABECALHO}>
                    <span className="flex-1 min-w-0">Coleção</span>
                    <span className="w-12 shrink-0 text-right">Artes</span>
                    <span className="w-12 shrink-0 text-right">Ativas</span>
                    <span className="w-16 shrink-0 text-right hidden sm:block">
                      Aguard.
                    </span>
                    <span aria-hidden className="w-2 shrink-0" />
                  </div>

                  <div className={CORPO}>
                  {meus.map((k) => {
                    const artes = k.produtos ?? []
                    const artesAtivas = artes.filter((p) => p.ativo).length
                    const inativas = artes.length - artesAtivas

                    return (
                      <Link
                        key={k.id}
                        href={`/admin/catalogo/${k.id}`}
                        data-busca={`${cliente.razao_social} ${k.nome} ${k.descricao ?? ''}`}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-white hover:bg-[#FAFAF8]"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className={NOME}>{k.nome}</span>
                            {!k.ativo && (
                              <span className={ETIQUETA + ' bg-[#EAE9E3] text-[#6E6E68]'}>
                                arquivado
                              </span>
                            )}
                          </span>
                          {k.descricao && (
                            <span className="block text-[10px] text-[#9B9A93] truncate">
                              {k.descricao}
                            </span>
                          )}
                        </span>

                        <span className={NUM + ' w-12 shrink-0 text-right text-[#6E6E68]'}>
                          {artes.length}
                        </span>
                        <span className={NUM + ' w-12 shrink-0 text-right text-[#6E6E68]'}>
                          {artesAtivas}
                        </span>
                        <span
                          className={
                            NUM +
                            ' w-16 shrink-0 text-right hidden sm:block ' +
                            (inativas > 0 ? 'text-[#C79600] font-semibold' : 'text-[#DDDCD5]')
                          }
                        >
                          {inativas > 0 ? inativas : '—'}
                        </span>

                        <span className="text-[#DDDCD5] shrink-0 leading-none">›</span>
                      </Link>
                    )
                  })}
                  </div>
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