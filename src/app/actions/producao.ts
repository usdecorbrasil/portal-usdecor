'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ETAPAS_MANUAIS = ['impressao', 'estampando', 'corte_costura', 'pronto'] as const

type Resultado = { ok: true } | { ok: false; erro: string }

function revalidar() {
  revalidatePath('/admin')
  revalidatePath('/admin/pedidos')
}

/** Avança o pedido para uma etapa manual */
export async function lancarStatus(
  pedidoId: string,
  status: string,
  observacao?: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    status: z.enum(ETAPAS_MANUAIS),
    observacao: z.string().trim().max(500).optional(),
  }).safeParse({ pedidoId, status, observacao })

  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_lancar_status', {
    p_pedido_id: parsed.data.pedidoId,
    p_status: parsed.data.status,
    p_observacao: parsed.data.observacao || null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}

/** Retorna o pedido para a etapa de Impressão */
export async function reimprimir(
  pedidoId: string,
  motivo: string,
  custo: 'interno' | 'cliente'
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
    custo: z.enum(['interno', 'cliente']),
  }).safeParse({ pedidoId, motivo, custo })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_reimprimir', {
    p_pedido_id: parsed.data.pedidoId,
    p_motivo: parsed.data.motivo,
    p_custo: parsed.data.custo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}

/** Cancela o pedido — só antes da nota fiscal */
export async function cancelarPedido(
  pedidoId: string,
  motivo: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
  }).safeParse({ pedidoId, motivo })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_cancelar_pedido', {
    p_pedido_id: parsed.data.pedidoId,
    p_motivo: parsed.data.motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath('/pedidos')
  return { ok: true }
}

/**
 * Ajusta a quantidade a faturar de um item.
 * Pode reduzir ou aumentar, com teto de 50% acima do pedido.
 * O teto é validado também no banco.
 */
export async function ajustarItem(
  itemId: string,
  quantidade: number,
  motivo: string
): Promise<Resultado> {
  const parsed = z.object({
    itemId: z.string().uuid(),
    quantidade: z.number().int().min(0).max(150000),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
  }).safeParse({ itemId, quantidade, motivo })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_ajustar_item', {
    p_item_id: parsed.data.itemId,
    p_quantidade: parsed.data.quantidade,
    p_motivo: parsed.data.motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath('/pedidos')
  return { ok: true }
}