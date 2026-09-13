'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { MAX_PARCELAS } from '@/lib/pagamento/config'

const schema = z.object({
  itens: z.array(
    z.object({
      produto_id: z.string().uuid(),
      quantidade: z.number().int().min(1).max(100000),
    })
  ).min(1, 'O pedido precisa ter ao menos um item')
   .max(200, 'Máximo de 200 itens por pedido'),
  notas: z.string().trim().max(2000).optional(),
  forma_pagamento: z.enum([
    'boleto_avista',
    'boleto_parcelado',
    'pix',
    'cartao_credito',
    'cartao_debito',
  ])
    .default('boleto_avista'),
  parcelas: z.number().int().min(2).max(MAX_PARCELAS).optional(),
}).refine(
  (d) => d.forma_pagamento !== 'boleto_parcelado' || d.parcelas !== undefined,
  { message: 'Escolha a quantidade de parcelas', path: ['parcelas'] }
).refine(
  (d) =>
    d.forma_pagamento === 'boleto_parcelado' ||
    d.forma_pagamento === 'cartao_credito' ||
    d.parcelas === undefined,
  {
    message: 'Esta forma de pagamento não aceita parcelamento',
    path: ['parcelas'],
  }
)

type Resultado =
  | { ok: true; numero: number; total: number }
  | { ok: false; erro: string }

export async function criarPedido(dados: {
  itens: { produto_id: string; quantidade: number }[]
  notas?: string
  forma_pagamento?: string
  parcelas?: number
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
  // preço, catálogo do cliente, produto ativo, anti-duplicidade, limite de crédito.
  const { data, error } = await supabase.rpc('criar_pedido', {
    p_itens: parsed.data.itens,
    p_notas: parsed.data.notas || null,
    p_forma_pagamento: parsed.data.forma_pagamento,
    p_parcelas: parsed.data.parcelas ?? null,
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

export async function verificarPodeParcelar(): Promise<boolean> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles')
    .select('cliente_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.cliente_id) return false

  const { data, error } = await supabase.rpc('cliente_pode_parcelar', {
    p_cliente_id: perfil.cliente_id,
  })

  if (error) return false

  return !!data
}