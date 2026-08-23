'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

/**
 * Move um pedido na fila de impressão.
 * Informe o pedido que ficará acima e o que ficará abaixo.
 * Deixe null para topo ou fim da fila.
 */
export async function reordenarFila(
  pedidoId: string,
  anteriorId: string | null,
  posteriorId: string | null
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    anteriorId: z.string().uuid().nullable(),
    posteriorId: z.string().uuid().nullable(),
  }).safeParse({ pedidoId, anteriorId, posteriorId })

  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' }

  const supabase = await createClient()

  // A função do banco confere se quem chamou é admin
  const { error } = await supabase.rpc('reordenar_fila', {
    p_pedido_id: parsed.data.pedidoId,
    p_anterior: parsed.data.anteriorId,
    p_posterior: parsed.data.posteriorId,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/admin/fila')
  return { ok: true }
}