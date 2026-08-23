'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
      id, sku, nome, preco, metros_por_unidade, imagem_path,
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
    precoMetro: Number(p.preco),
    metrosPorUnidade: Number(p.metros_por_unidade),
    catalogo: p.catalogos?.nome ?? '',
    imagemUrl: p.imagem_path ? urls.get(p.imagem_path) ?? null : null,
  }))
}