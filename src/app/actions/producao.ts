'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateEmProducao } from '@/lib/resend/templates/em-producao'
import { MAX_PARCELAS, taxaDoPedido } from '@/lib/pagamento/config'
import { urlDoSite } from '@/lib/site'
import { sincronizarPedidoComBling } from '@/lib/bling/pedido'
import { enviarCobrancaPedido } from '@/lib/cobranca/enviar'
import { buscarValorMinimoBoleto } from './configuracoes'

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

  // Boleto abaixo do mínimo não fecha: "Pedido pronto" é o último momento em
  // que ainda dá para trocar forma ou parcelas sem mexer em cobrança emitida
  if (parsed.data.status === 'pronto') {
    const bloqueio = await boletoAbaixoDoMinimo(parsed.data.pedidoId)
    if (bloqueio) return { ok: false, erro: bloqueio }
  }

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

  // Ao ficar pronto: pedido no ERP e cobrança ao cliente. Em `after()`, depois
  // de a resposta sair: são três chamadas ao Bling com pausa entre elas mais
  // um e-mail, e esperar por isso dentro da requisição estourava o tempo da
  // função na Vercel — o pedido 1006 ficou "pendente" sem nunca ser enviado.
  // Nenhum dos dois pode derrubar o lançamento da etapa
  if (parsed.data.status === 'pronto') {
    const id = parsed.data.pedidoId
    after(async () => {
      await sincronizarPedidoComBling(id)
      await enviarCobrancaPedido(id)
    })
  }

  revalidar()
  return { ok: true }
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Mensagem de bloqueio quando o boleto ficaria abaixo do mínimo por documento,
 * ou null quando pode seguir. Parcelado compara a menor parcela; à vista, o
 * valor cobrado inteiro. Sem valor (metragem ainda não lançada) não há o que
 * comparar.
 */
async function boletoAbaixoDoMinimo(pedidoId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pedidos')
    .select('forma_pagamento, total, taxa_pagamento_percentual, taxa_pagamento_fixa, pedido_parcelas(valor)')
    .eq('id', pedidoId)
    .maybeSingle()

  const p = data as unknown as {
    forma_pagamento: string
    total: number | string
    taxa_pagamento_percentual: number | string | null
    taxa_pagamento_fixa: number | string | null
    pedido_parcelas: { valor: number | string }[]
  } | null

  if (!p || !p.forma_pagamento?.startsWith('boleto')) return null

  const total = Number(p.total)
  if (total <= 0) return null

  const parcelas = p.pedido_parcelas ?? []
  const documento =
    parcelas.length > 0
      ? Math.min(...parcelas.map((x) => Number(x.valor)))
      : total +
        taxaDoPedido(
          total,
          Number(p.taxa_pagamento_percentual ?? 0),
          Number(p.taxa_pagamento_fixa ?? 0),
          p.forma_pagamento,
          1
        )

  const minimo = await buscarValorMinimoBoleto()
  if (documento >= minimo) return null

  return (
    `Cada boleto ficaria em R$ ${brl(documento)}, abaixo do mínimo de R$ ${brl(minimo)}. ` +
    'Altere a forma de pagamento — menos parcelas ou outra forma — antes de dar o pedido como pronto.'
  )
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

/** Etapas em que quantidade e preço não mudam mais: o valor já foi ao Bling. */
const VALOR_FECHADO = ['pronto', 'nf_emitida', 'expedido', 'entregue', 'fechado']

async function valorFechado(pedidoId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pedido_status_historico')
    .select('status')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return !!data && VALOR_FECHADO.includes(String(data.status))
}

const ERRO_FECHADO =
  'O pedido já está pronto: quantidade e preço não mudam mais. Se precisar, cancele e refaça.'

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

  const { data: item } = await supabase
    .from('pedido_itens')
    .select('pedido_id')
    .eq('id', parsed.data.itemId)
    .maybeSingle()

  if (item && (await valorFechado(String(item.pedido_id)))) {
    return { ok: false, erro: ERRO_FECHADO }
  }

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

  if (await valorFechado(parsed.data.pedidoId)) {
    return { ok: false, erro: ERRO_FECHADO }
  }

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

  if (await valorFechado(parsed.data.pedidoId)) {
    return { ok: false, erro: ERRO_FECHADO }
  }

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
