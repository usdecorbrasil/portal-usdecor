'use server'

// src/app/actions/agrupamento.ts
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function agruparPedidos(pedidoIds: string[], notas?: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('agrupar_pedidos', {
    p_pedido_ids: pedidoIds,
    p_notas: notas ?? null,
  })
  if (error) return { ok: false as const, erro: error.message }

  // TODO (passo seguinte): enviar o agrupador ao Bling com a mesma função
  // usada na confirmação de pedido.

  revalidatePath('/admin')
  revalidatePath('/admin/pedidos')
  return { ok: true as const, pedidoId: data as string }
}

export async function desagruparPedidos(pedidoId: string, motivo: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('desagrupar_pedidos', {
    p_pedido_id: pedidoId,
    p_motivo: motivo,
  })
  if (error) return { ok: false as const, erro: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pedidos')
  // Se o agrupador já tinha pedido de venda no Bling, cancele lá manualmente —
  // mesmo procedimento do cancelamento de pedido hoje.
  return { ok: true as const }
}