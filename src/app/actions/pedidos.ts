'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  itens: z.array(
    z.object({
      produto_id: z.string().uuid(),
      quantidade: z.number().int().min(1).max(100000),
    })
  ).min(1, 'O pedido precisa ter ao menos um item')
   .max(200, 'Máximo de 200 itens por pedido'),
  notas: z.string().trim().max(2000).optional(),
})

type Resultado =
  | { ok: true; numero: number; total: number }
  | { ok: false; erro: string }

export async function criarPedido(dados: {
  itens: { produto_id: string; quantidade: number }[]
  notas?: string
}): Promise<Resultado> {
  const parsed = schema.safeParse(dados)

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  // Toda a validação real acontece dentro da função do banco:
  // preço, catálogo do cliente, produto ativo, anti-duplicidade.
  const { data, error } = await supabase.rpc('criar_pedido', {
    p_itens: parsed.data.itens,
    p_notas: parsed.data.notas || null,
  })

  if (error) {
    return { ok: false, erro: error.message }
  }

  const pedido = Array.isArray(data) ? data[0] : data

  if (!pedido) {
    return { ok: false, erro: 'Não foi possível registrar o pedido.' }
  }

  revalidatePath('/pedidos')
  revalidatePath('/admin')

  return {
    ok: true,
    numero: Number(pedido.numero),
    total: Number(pedido.total),
  }
}