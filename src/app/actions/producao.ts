'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateEmProducao } from '@/lib/resend/templates/em-producao'
import { templatePedidoPronto } from '@/lib/resend/templates/pedido-pronto'
import { MAX_PARCELAS, taxaDoPedido } from '@/lib/pagamento/config'
import { urlDoSite } from '@/lib/site'
import { sincronizarPedidoComBling } from '@/lib/bling/pedido'
import { buscarLinksCobranca } from '@/lib/bling/cobranca'

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

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

  // Ao ficar pronto: pedido no ERP e cobrança ao cliente. Nenhum dos dois
  // pode derrubar o lançamento da etapa — a produção não espera sistema externo
  if (parsed.data.status === 'pronto') {
    await sincronizarPedidoComBling(parsed.data.pedidoId)
    await enviarCobranca(parsed.data.pedidoId)
  }

  revalidar()
  return { ok: true }
}

/**
 * Cobrança do pedido pronto. Falha aqui não derruba o lançamento da etapa: a
 * produção não pode ficar travada porque o e-mail não saiu, e `email_log` tem
 * chave única por pedido + tipo, então dá para reenviar sem duplicar.
 */
async function enviarCobranca(pedidoId: string) {
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(`
      numero, total, metragem_impressa, forma_pagamento,
      taxa_pagamento_percentual, taxa_pagamento_fixa,
      clientes(email, razao_social, bling_contato_id),
      pedido_parcelas(numero, valor, vencimento, boleto_linha)
    `)
    .eq('id', pedidoId)
    .single()

  if (!pedido) return

  const p = pedido as unknown as {
    numero: number
    total: number | string
    metragem_impressa: number | string | null
    forma_pagamento: string
    taxa_pagamento_percentual: number | string | null
    taxa_pagamento_fixa: number | string | null
    clientes: {
      email: string
      razao_social: string
      bling_contato_id: number | null
    } | null
    pedido_parcelas: {
      numero: number
      valor: number | string
      vencimento: string
      boleto_linha: string | null
    }[]
  }

  const cliente = p.clientes
  if (!cliente?.email) return

  const base = (p.pedido_parcelas ?? [])
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .map((pc) => ({
      numero: pc.numero,
      valor: Number(pc.valor),
      vencimento: String(pc.vencimento).slice(0, 10),
      linhaDigitavel: pc.boleto_linha ?? null,
    }))

  // Pix e boleto do Bling Conta nascem nas contas a receber, não no pedido de
  // venda. Se ainda não existirem, o e-mail sai sem eles e avisa o cliente
  const links = cliente.bling_contato_id
    ? await buscarLinksCobranca(Number(cliente.bling_contato_id), base)
    : []

  const parcelas = base.map((pc) => {
    const l = links.find(
      (x) => x.vencimento === pc.vencimento && Math.abs(x.valor - pc.valor) < 0.01
    )
    return { ...pc, linkPix: l?.pix ?? null, linkBoleto: l?.boleto ?? null }
  })

  const valorMercadoria = Number(p.total)

  const taxa = taxaDoPedido(
    valorMercadoria,
    Number(p.taxa_pagamento_percentual ?? 0),
    Number(p.taxa_pagamento_fixa ?? 0),
    p.forma_pagamento,
    parcelas.length || 1
  )

  await enviarEmail({
    tipo: 'pedido_pronto',
    pedidoId,
    destinatario: cliente.email,
    assunto: `Pedido #${p.numero} pronto — valor para pagamento`,
    html: templatePedidoPronto({
      clienteNome: cliente.razao_social,
      numero: Number(p.numero),
      metragem:
        p.metragem_impressa != null ? Number(p.metragem_impressa) : null,
      valorMercadoria,
      taxa,
      totalCobrado: Math.round((valorMercadoria + taxa) * 100) / 100,
      rotuloPagamento:
        ROTULOS_PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento,
      parcelas,
      urlPedido: `${urlDoSite()}/pedidos/${pedidoId}`,
    }),
  })
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
    formaNova: z.enum([
      'boleto_avista',
      'boleto_parcelado',
      'pix',
      'cartao_credito',
      'cartao_debito',
    ]),
    motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
    parcelas: z.number().int().min(2).max(MAX_PARCELAS).optional(),
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

/**
 * Define se o pedido sai com ou sem nota fiscal.
 *
 * A decisão vale até "Pedido pronto": é a etapa que cria o pedido de venda no
 * Bling, e quem fatura lê a decisão de lá. Depois da nota emitida o banco
 * recusa a troca — mudar viraria divergência com o que já foi para a SEFAZ.
 *
 * O motivo só é exigido para dispensar a nota. Emitir é o caminho normal e não
 * precisa de justificativa; a exceção é que precisa ficar registrada.
 */
export async function definirEmissaoNf(
  pedidoId: string,
  emitir: boolean,
  motivo?: string
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    emitir: z.boolean(),
    motivo: z.string().trim().max(500).optional(),
  }).safeParse({ pedidoId, emitir, motivo })

  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' }

  if (!parsed.data.emitir && (parsed.data.motivo ?? '').length < 10) {
    return {
      ok: false,
      erro: 'Descreva por que o pedido sai sem nota fiscal (mín. 10 caracteres).',
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_definir_emissao_nf', {
    p_pedido_id: parsed.data.pedidoId,
    p_emitir: parsed.data.emitir,
    p_motivo: parsed.data.motivo ?? null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath(`/admin/pedidos/${parsed.data.pedidoId}`)
  return { ok: true }
}
