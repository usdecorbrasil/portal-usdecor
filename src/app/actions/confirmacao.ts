'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { enviarEmail } from '@/lib/resend/enviar'
import { templatePedidoConfirmado } from '@/lib/resend/templates/pedido-confirmado'
import { urlDoSite } from '@/lib/site'
import { MAX_PARCELAS } from '@/lib/pagamento/config'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateInterno } from '@/lib/resend/templates/interno'

type Resultado = { ok: true } | { ok: false; erro: string }

function revalidar() {
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin/dashboard')
  revalidatePath('/pedidos')
}

/** Equipe confirma o pedido e libera a produção */
export async function confirmarPedido(
  pedidoId: string,
  parcelamento?: { quantidade: number; primeiroVencimento: string }
): Promise<Resultado> {
  const parsedId = z.string().uuid().safeParse(pedidoId)
  if (!parsedId.success) return { ok: false, erro: 'Pedido inválido.' }

  const supabase = await createClient()

  if (parcelamento) {
    const parsedParc = z.object({
      quantidade: z.number().int().min(2).max(MAX_PARCELAS),
      primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    }).safeParse(parcelamento)

    if (!parsedParc.success) {
      return { ok: false, erro: parsedParc.error.issues[0].message }
    }

    const { error: erroParc } = await supabase.rpc('parcelar_pedido', {
      p_pedido_id: parsedId.data,
      p_quantidade_parcelas: parsedParc.data.quantidade,
      p_primeiro_vencimento: parsedParc.data.primeiroVencimento,
    })

    if (erroParc) return { ok: false, erro: erroParc.message }
  }

  const { error } = await supabase.rpc('confirmar_pedido', {
    p_pedido_id: parsedId.data,
  })

  if (error) return { ok: false, erro: error.message }

  // E-mail ao cliente — não bloqueia a confirmação se falhar
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('numero, total, clientes(email, razao_social)')
    .eq('id', parsedId.data)
    .single()

  if (pedido) {
    const cliente = pedido.clientes as unknown as {
      email: string
      razao_social: string
    } | null

    if (cliente?.email) {
      await enviarEmail({
        tipo: 'pedido_recebido',
        pedidoId: parsedId.data,
        destinatario: cliente.email,
        assunto: `Pedido #${pedido.numero} confirmado`,
        html: templatePedidoConfirmado({
          clienteNome: cliente.razao_social,
          numero: Number(pedido.numero),
          total: Number(pedido.total),
          urlPedido: `${urlDoSite()}/pedidos/${parsedId.data}`,
        }),
      })
    }
  }

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

  // A solicitação fica aberta esperando alguém responder; sem aviso ela só
  // seria vista por quem abrisse o pedido por acaso
  try {
    const { data: p } = await supabase
      .from('pedidos')
      .select('numero, clientes(razao_social)')
      .eq('id', parsed.data.pedidoId)
      .maybeSingle()

    if (p) {
      const cliente = p.clientes as unknown as { razao_social: string } | null
      await notificarEquipe('cancelamento_solicitado', {
        pedidoId: parsed.data.pedidoId,
        assunto: `Cancelamento solicitado — pedido #${p.numero}`,
        html: templateInterno({
          titulo: `Pedido #${p.numero}: cliente pede cancelamento`,
          linhas: [{ rotulo: 'Cliente', valor: cliente?.razao_social ?? '—' }],
          texto: `Motivo: ${parsed.data.motivo}`,
          urlAcao: `${urlDoSite()}/admin/pedidos/${parsed.data.pedidoId}`,
          rotuloAcao: 'RESPONDER',
        }),
      })
    }
  } catch (e) {
    console.error('[cancelamento_solicitado]', e)
  }

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