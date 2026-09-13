'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateEmProducao } from '@/lib/resend/templates/em-producao'
import { urlDoSite } from '@/lib/site'

const ETAPAS_MANUAIS = ['impressao', 'estampando', 'corte_costura', 'pronto'] as const

type Resultado = { ok: true } | { ok: false; erro: string }

function revalidar() {
  revalidatePath('/admin')
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin/fila')
}

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

  // E-mail "Em produção" — só quando a etapa lançada é Impressão
  if (parsed.data.status === 'impressao') {
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('numero, clientes(email, razao_social)')
      .eq('id', parsed.data.pedidoId)
      .single()

    if (pedido) {
      const cliente = pedido.clientes as unknown as {
        email: string
        razao_social: string
      } | null

      if (cliente?.email) {
        await enviarEmail({
          tipo: 'em_producao',
          pedidoId: parsed.data.pedidoId,
          destinatario: cliente.email,
          assunto: `Pedido #${pedido.numero} entrou em produção`,
          html: templateEmProducao({
            clienteNome: cliente.razao_social,
            numero: Number(pedido.numero),
            urlPedido: `${urlDoSite()}/pedidos/${parsed.data.pedidoId}`,
          }),
        })
      }
    }
  }

  revalidar()
  return { ok: true }
}

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

export async function adicionarItem(
  pedidoId: string,
  produtoId: string,
  quantidade: number,
  motivo: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    produtoId: z.string().uuid(),
    quantidade: z.number().int().min(1).max(100000),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
  }).safeParse({ pedidoId, produtoId, quantidade, motivo })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_adicionar_item', {
    p_pedido_id: parsed.data.pedidoId,
    p_produto_id: parsed.data.produtoId,
    p_quantidade: parsed.data.quantidade,
    p_motivo: parsed.data.motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath('/pedidos')
  return { ok: true }
}

/**
 * Altera o preço por metro de um pedido específico.
 * Não afeta o preço padrão do cliente nem outros pedidos.
 */
export async function alterarPrecoPedido(
  pedidoId: string,
  precoMetro: number,
  motivo: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    precoMetro: z.number().positive('Preço deve ser maior que zero'),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
  }).safeParse({ pedidoId, precoMetro, motivo })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_alterar_preco_pedido', {
    p_pedido_id: parsed.data.pedidoId,
    p_preco_metro: parsed.data.precoMetro,
    p_motivo: parsed.data.motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath('/pedidos')
  return { ok: true }
}
export async function alterarFormaPagamento(
  pedidoId: string,
  formaNova: string,
  motivo: string,
  parcelas?: number,
  primeiroVencimento?: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    formaNova: z.enum(['boleto_avista', 'boleto_parcelado', 'cartao_credito', 'cartao_debito']),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
    parcelas: z.number().int().min(2).max(12).optional(),
    primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional(),
  }).safeParse({ pedidoId, formaNova, motivo, parcelas, primeiroVencimento })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  if (parsed.data.formaNova === 'boleto_parcelado' && (!parsed.data.parcelas || !parsed.data.primeiroVencimento)) {
    return { ok: false, erro: 'Informe quantidade de parcelas e primeiro vencimento.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_alterar_forma_pagamento', {
    p_pedido_id: parsed.data.pedidoId,
    p_forma_nova: parsed.data.formaNova,
    p_motivo: parsed.data.motivo,
    p_parcelas: parsed.data.parcelas ?? null,
    p_primeiro_vencimento: parsed.data.primeiroVencimento ?? null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath('/pedidos')
  return { ok: true }
}