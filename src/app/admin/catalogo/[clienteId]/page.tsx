import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import FormularioProduto from './formulario'
import CardArte from './card-arte'
import EditarColecao from '@/components/editar-colecao'

export default async function CatalogoPage({
  params,
}: {
  params: Promise<{ clienteId: string }>
}) {
  const { clienteId: catalogoId } = await params
  const perfil = await lerPerfil()

  if (!perfil || perfil.papel === 'cliente') redirect('/')

  const dono = perfil.papel === 'admin'
  const supabase = await createClient()

  const { data: catalogo } = await supabase
    .from('catalogos')
    .select('id, nome, descricao, ativo, cliente_id, clientes(razao_social)')
    .eq('id', catalogoId)
    .single()

  if (!catalogo) notFound()

  const cliente = catalogo.clientes as unknown as { razao_social: string }

  const { data: colecoes } = await supabase
    .from('catalogos')
    .select('id, nome')
    .eq('cliente_id', catalogo.cliente_id)
    .eq('ativo', true)
    .order('nome')

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, sku, nome, tecido, preco, metros_por_unidade, ativo, imagem_path, catalogo_id')
    .eq('catalogo_id', catalogoId)
    .order('ativo', { ascending: false })
    .order('sku')

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

  const inativas = produtos?.filter((p) => !p.ativo).length ?? 0

  return (
    <div>
      <Link
        href="/admin/catalogo"
        className="text-xs tracking-widest text-[#6E6E68] hover:text-[#131A2E]"
      >
        ← CATÁLOGOS
      </Link>

      <p className="text-sm text-[#6E6E68] mt-3">{cliente.razao_social}</p>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
          {catalogo.nome}
          {!catalogo.ativo && (
            <span className="ml-2 text-sm font-normal bg-[#EAE9E3] text-[#6E6E68] px-2 py-0.5 rounded-sm align-middle">
              arquivado
            </span>
          )}
        </h1>
        <div className="pt-2">
          <EditarColecao
            catalogoId={catalogo.id}
            nomeAtual={catalogo.nome}
            descricaoAtual={catalogo.descricao}
          />
        </div>
      </div>

      {catalogo.descricao && (
        <p className="text-sm text-[#6E6E68] mt-1">{catalogo.descricao}</p>
      )}

      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        {produtos?.length ?? 0} artes
        {inativas > 0 && ` · ${inativas} aguardando ativação`}
      </p>

      {dono && (
        <FormularioProduto
          clienteId={catalogo.cliente_id}
          catalogoId={catalogo.id}
          colecoes={colecoes ?? []}
        />
      )}

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {produtos?.map((p) => (
          <CardArte
            key={p.id}
            produto={{
              id: p.id,
              sku: p.sku,
              nome: p.nome,
              tecido: p.tecido,
              preco: Number(p.preco),
              metrosPorUnidade: Number(p.metros_por_unidade),
              ativo: p.ativo,
              catalogoId: p.catalogo_id,
            }}
            imagemUrl={p.imagem_path ? urls.get(p.imagem_path) ?? null : null}
            colecoes={colecoes ?? []}
            podeEditar={dono}
          />
        ))}

        {(!produtos || produtos.length === 0) && (
          <div className="sm:col-span-2 lg:col-span-3 border border-dashed border-[#DDDCD5] rounded-sm py-12 text-center">
            <p className="text-sm text-[#6E6E68]">
              Nenhuma arte neste catálogo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}