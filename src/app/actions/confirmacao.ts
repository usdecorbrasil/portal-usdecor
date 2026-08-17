'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

function revalidar() {
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin/dashboard')
  revalidatePath('/pedidos')
}

/** Equipe confirma o pedido e libera a produção */
export async function confirmarPedido(pedidoId: string): Promise<Resultado> {
  const parsed = z.string().uuid().safeParse(pedidoId)
  if (!parsed.success) return { ok: false, erro: 'Pedido inválido.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('confirmar_pedido', {
    p_pedido_id: parsed.data,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}

/** Cliente cancela — só enquanto aguarda confirmação */
export async function clienteCancelar(
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
  const { error } = await supabase.rpc('cliente_cancelar_pedido', {
    p_pedido_id: parsed.data.pedidoId,
    p_motivo: parsed.data.motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}

/** Cliente solicita cancelamento — depois da confirmação */
export async function solicitarCancelamento(
  pedidoId: string,
  motivo: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(1000),
  }).safeParse({ pedidoId, motivo })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cliente_solicitar_cancelamento', {
    p_pedido_id: parsed.data.pedidoId,
    p_motivo: parsed.data.motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}

/** Dono responde a solicitação. Aceitar já cancela o pedido. */
export async function responderSolicitacao(
  solicitacaoId: string,
  aceitar: boolean,
  resposta?: string
): Promise<Resultado> {
  const parsed = z.object({
    solicitacaoId: z.string().uuid(),
    aceitar: z.boolean(),
    resposta: z.string().trim().max(1000).optional(),
  }).safeParse({ solicitacaoId, aceitar, resposta })

  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('responder_solicitacao', {
    p_solicitacao_id: parsed.data.solicitacaoId,
    p_aceitar: parsed.data.aceitar,
    p_resposta: parsed.data.resposta || null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}