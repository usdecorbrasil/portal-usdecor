import { createClient } from '@/lib/supabase/server'
import CardProduto from './card-produto'
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
    .select('id, catalogo_id, sku, nome, tecido, preco, metros_por_unidade, imagem_path')
    .order('ordem')
    .order('sku')

  // Envios de arte deste cliente — a política do banco filtra
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
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Seu catálogo
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
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
        <div className="space-y-8">
          {comArtes.map((k) => (
            <section key={k.id}>
              {comArtes.length > 1 && (
                <div className="border-b-2 border-[#131A2E] pb-2 mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold tracking-tight">{k.nome}</h2>
                    <EditarColecao
                      catalogoId={k.id}
                      nomeAtual={k.nome}
                      descricaoAtual={k.descricao}
                      compacto
                    />
                  </div>
                  {k.descricao && (
                    <p className="text-xs text-[#6E6E68] mt-0.5">
                      {k.descricao}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {k.artes.map((p) => (
                  <CardProduto
                    key={p.id}
                    produto={{
                      id: p.id,
                      sku: p.sku,
                      nome: p.nome,
                      tecido: p.tecido,
                      precoMetro: Number(p.preco),
                      metrosPorUnidade: Number(p.metros_por_unidade),
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