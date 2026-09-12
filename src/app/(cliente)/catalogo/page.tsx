import { createClient } from '@/lib/supabase/server'
import CardProduto from './card-produto'
import BuscaPagina from '@/components/busca-pagina'
import EditarColecao from '@/components/editar-colecao'
import EnvioArtes from './envio-artes'

export default async function CatalogoPage() {
  const supabase = await createClient()

  const { data: catalogos } = await supabase
    .from('catalogos')
    .select('id, nome, descricao')
    .order('ordem')
    .order('nome')

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, catalogo_id, sku, nome, imagem_path')
    .order('ordem')
    .order('sku')

  const { data: envios } = await supabase
    .from('envios_arte')
    .select('id, link, observacoes, situacao, resposta_admin, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  const caminhos = produtos?.map((p) => p.imagem_path).filter(Boolean) as string[]
  const urls = new Map<string, string>()

  if (caminhos?.length) {
    const { data: assinadas } = await supabase.storage
      .from('artes')
      .createSignedUrls(caminhos, 3600)

    assinadas?.forEach((a) => {
      if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl)
    })
  }

  const colecoes = (catalogos ?? []).map((k) => ({ id: k.id, nome: k.nome }))

  const comArtes = (catalogos ?? [])
    .map((k) => ({
      ...k,
      artes: produtos?.filter((p) => p.catalogo_id === k.id) ?? [],
    }))
    .filter((k) => k.artes.length > 0)

  const total = produtos?.length ?? 0

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Seu catálogo
        </h1>
        <BuscaPagina
          placeholder="Filtrar por SKU ou nome..."
          rotulo="Filtrar as artes desta página"
        />
      </div>
      <p className="text-sm text-[#6E6E68] mt-1.5 mb-8">
        {total} {total === 1 ? 'arte liberada' : 'artes liberadas'}
        {comArtes.length > 1 && ` em ${comArtes.length} coleções`}
      </p>

      {comArtes.length === 0 ? (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
          <p className="text-sm text-[#6E6E68]">
            Seu catálogo ainda está sendo montado.
          </p>
          <p className="text-xs text-[#6E6E68] mt-2">
            Envie suas artes pelo botão abaixo para começarmos.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {comArtes.map((k) => (
            <section key={k.id} data-busca-grupo>
              {comArtes.length > 1 && (
                <div className="flex items-start justify-between gap-3 pb-3 mb-5 border-b-2 border-[#131A2E]">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[#131A2E]">
                      {k.nome}
                    </h2>
                    {k.descricao && (
                      <p className="text-sm text-[#6E6E68] mt-1">
                        {k.descricao}
                      </p>
                    )}
                  </div>
                  <div className="pt-1.5 shrink-0">
                    <EditarColecao
                      catalogoId={k.id}
                      nomeAtual={k.nome}
                      descricaoAtual={k.descricao}
                      compacto
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {k.artes.map((p, idx) => (
                  <CardProduto
                    key={p.id}
                    dadosBusca={`${p.sku} ${p.nome}`}
                    prioridade={idx < 6}
                    produto={{
                      id: p.id,
                      sku: p.sku,
                      nome: p.nome,
                      catalogoId: p.catalogo_id,
                    }}
                    imagemUrl={
                      p.imagem_path ? urls.get(p.imagem_path) ?? null : null
                    }
                    colecoes={colecoes}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <EnvioArtes
        envios={(envios ?? []).map((e) => ({
          id: e.id,
          link: e.link,
          observacoes: e.observacoes,
          situacao: e.situacao,
          resposta: e.resposta_admin,
          criadoEm: e.created_at,
        }))}
      />
    </div>
  )
}