'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'

const schema = z.object({
  clienteId: z.string().uuid('Selecione um cliente'),
  itens: z.array(
    z.object({
      produto_id: z.string().uuid(),
      quantidade: z.number().int().min(1).max(100000),
    })
  ).min(1, 'O pedido precisa ter ao menos um item')
   .max(200, 'Máximo de 200 artes diferentes por pedido'),
  notas: z.string().trim().max(2000).optional(),
})

type Resultado =
  | { ok: true; numero: number; total: number; pedidoId: string }
  | { ok: false; erro: string }

export async function criarPedidoAdmin(dados: {
  clienteId: string
  itens: { produto_id: string; quantidade: number }[]
  notas?: string
}): Promise<Resultado> {
  const parsed = schema.safeParse(dados)

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // A função do banco confere se quem chamou é admin
  const { data, error } = await supabase.rpc('admin_criar_pedido', {
    p_cliente_id: parsed.data.clienteId,
    p_itens: parsed.data.itens,
    p_notas: parsed.data.notas || null,
  })

  if (error) return { ok: false, erro: error.message }

  const pedido = Array.isArray(data) ? data[0] : data

  if (!pedido) {
    return { ok: false, erro: 'Não foi possível registrar o pedido.' }
  }

  revalidatePath('/admin/pedidos')
  revalidatePath('/admin/dashboard')
  revalidatePath('/pedidos')

  return {
    ok: true,
    pedidoId: pedido.pedido_id,
    numero: Number(pedido.numero),
    total: Number(pedido.total),
  }
}

/** Busca o catálogo ativo de um cliente, para montar o pedido */
export async function buscarCatalogo(clienteId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('produtos')
    .select(`
      id, sku, nome, largura, altura, imagem_path,
      catalogos!inner(id, nome, ativo)
    `)
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .eq('catalogos.ativo', true)
    .order('sku')

  const produtos = (data ?? []) as any[]

  // Links temporários para as miniaturas
  const caminhos = produtos
    .map((p) => p.imagem_path)
    .filter(Boolean) as string[]

  const urls = new Map<string, string>()

  if (caminhos.length) {
    const { data: assinadas } = await supabase.storage
      .from('artes')
      .createSignedUrls(caminhos, 3600)

    assinadas?.forEach((a) => {
      if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl)
    })
  }

  return produtos.map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    largura: p.largura != null ? Number(p.largura) : null,
    altura: p.altura != null ? Number(p.altura) : null,
    catalogo: p.catalogos?.nome ?? '',
    imagemUrl: p.imagem_path ? urls.get(p.imagem_path) ?? null : null,
  }))
}
/**
 * Itens de um pedido, no formato que os modais de mudança de status esperam.
 * Usado pelo quadro arrastável, que só carrega os itens quando a etapa de
 * destino exige conferência (Impressão e Estampando).
 * Funcionário não recebe preço — mesma regra das demais telas.
 */
export async function buscarItensPedido(pedidoId: string) {
  const parsed = z.string().uuid().safeParse(pedidoId)
  if (!parsed.success) return null

  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') return null

  const supabase = await createClient()

  const { data } = await supabase
    .from('pedido_itens')
    .select(
      perfil.veValores
        ? 'id, produto_id, sku, nome, preco_unitario, quantidade_pedida, quantidade_faturada'
        : 'id, produto_id, sku, nome, quantidade_pedida, quantidade_faturada'
    )
    .eq('pedido_id', parsed.data)
    .order('sku')

  return ((data ?? []) as any[]).map((i) => ({
    id: i.id as string,
    produtoId: i.produto_id as string,
    sku: i.sku as string,
    nome: i.nome as string,
    pedida: Number(i.quantidade_pedida),
    faturada: Number(i.quantidade_faturada),
    precoMetro: i.preco_unitario != null ? Number(i.preco_unitario) : 0,
    imagemUrl: null as string | null,
  }))
}
