import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/resend/enviar'
import { templatePedidoPronto } from '@/lib/resend/templates/pedido-pronto'
import { taxaDoPedido } from '@/lib/pagamento/config'
import { urlDoSite } from '@/lib/site'
import { buscarLinksCobranca } from '@/lib/bling/cobranca'

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

/*
 * Módulo próprio, e não parte de `actions/producao.ts`, por dois motivos:
 * roda dentro de `after()`, depois de a resposta já ter saído, onde não há
 * cookies de sessão — por isso usa a chave de serviço; e exportar de um
 * arquivo 'use server' viraria endpoint público, e cobrança não pode ser
 * disparada por quem quiser.
 */

/**
 * Cobrança do pedido pronto. Falha aqui não derruba o lançamento da etapa: a
 * produção não pode ficar travada porque o e-mail não saiu, e `email_log` tem
 * chave única por pedido + tipo, então dá para reenviar sem duplicar.
 */
export async function enviarCobrancaPedido(pedidoId: string) {
  const admin = createAdminClient()

  const { data: pedido } = await admin
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
