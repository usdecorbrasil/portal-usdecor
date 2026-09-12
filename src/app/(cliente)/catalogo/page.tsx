import { createClient } from '@/lib/supabase/server'
import ListaCatalogo from './lista-catalogo'
import BuscaPagina from '@/components/busca-pagina'
import { ProvedorBusca } from '@/components/busca-contexto'
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

  const colecoes = (catalogos ?? []).map((k) => ({
    id: k.id,
    nome: k.nome,
    descricao: k.descricao as string | null,
  }))

  const artes = (produtos ?? []).map((p) => ({
    id: p.id,
    catalogoId: p.catalogo_id as string,
    sku: p.sku as string,
    nome: p.nome as string,
    imagemUrl: p.imagem_path ? urls.get(p.imagem_path) ?? null : null,
  }))

  const comArtes = colecoes.filter((k) =>
    artes.some((a) => a.catalogoId === k.id)
  )

  const total = artes.length

  return (
    <ProvedorBusca>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-[#131A2E] shrink-0">
            Seu catálogo
          </h1>
          <BuscaPagina
            placeholder="Filtrar por SKU ou nome..."
            rotulo="Filtrar as artes do seu catálogo"
          />
        </div>
        <p className="text-sm text-[#6E6E68] mt-1.5 mb-8">
          {total} {total === 1 ? 'arte liberada' : 'artes liberadas'}
          {comArtes.length > 1 && ` em ${comArtes.length} coleções`}
        </p>

        <ListaCatalogo colecoes={colecoes} artes={artes} />

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
    </ProvedorBusca>
  )
}