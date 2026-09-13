import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarBling } from './cliente'
import { taxaDoPedido } from '@/lib/pagamento/config'

/**
 * Cria o pedido de venda no Bling quando a etapa "Pedido pronto" é lançada.
 *
 * Por que só aqui e não na confirmação: o valor do pedido é `metragem × preço
 * por metro`, e a metragem só existe depois da estampa. Criar antes obrigaria
 * a conviver com valores errados no ERP por dias e a atualizar depois.
 *
 * O pedido vai com **uma linha de metragem**, não uma linha por arte: no
 * portal a quantidade de peças serve à produção, não ao preço, então somar
 * peças não fecharia com o total nem com os boletos.
 */

/** O Bling recusa acima de 3 requisições por segundo. */
const PAUSA_MS = 400

const pausa = () => new Promise((r) => setTimeout(r, PAUSA_MS))

type ConfigBling = {
  /** Código, no Bling, do produto genérico de estampa cobrado por metro. */
  produtoEstampaCodigo: string
  /** Forma de pagamento do Bling para boleto. */
  formaPagamentoId: number | null
  /** Forma de pagamento do Bling para Pix — é ela que gera o QR Code. */
  formaPagamentoPixId: number | null
}

const CONFIG_PADRAO: ConfigBling = {
  produtoEstampaCodigo: 'ESTAMPA',
  formaPagamentoId: null,
  formaPagamentoPixId: null,
}

async function lerConfig(): Promise<ConfigBling> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'bling')
    .maybeSingle()

  if (!data?.valor) return CONFIG_PADRAO

  try {
    const j = JSON.parse(data.valor) as Partial<ConfigBling>
    return {
      produtoEstampaCodigo:
        j.produtoEstampaCodigo || CONFIG_PADRAO.produtoEstampaCodigo,
      formaPagamentoId:
        typeof j.formaPagamentoId === 'number' ? j.formaPagamentoId : null,
      formaPagamentoPixId:
        typeof j.formaPagamentoPixId === 'number' ? j.formaPagamentoPixId : null,
    }
  } catch {
    return CONFIG_PADRAO
  }
}

type Falha = { ok: false; erro: string }
type Sucesso = { ok: true; blingId: number; numero: number | null }

/** Primeiro item de uma listagem do Bling, ou null. */
function primeiro(dados: unknown): Record<string, unknown> | null {
  const lista = (dados as { data?: unknown[] })?.data
  return Array.isArray(lista) && lista.length > 0
    ? (lista[0] as Record<string, unknown>)
    : null
}

export async function criarPedidoNoBling(
  pedidoId: string
): Promise<Sucesso | Falha> {
  const admin = createAdminClient()

  const { data: pedido } = await admin
    .from('pedidos')
    .select(`
      numero, total, metragem_impressa, forma_pagamento, notas, emitir_nf,
      taxa_pagamento_percentual, taxa_pagamento_fixa,
      bling_pedido_id,
      clientes(razao_social, cnpj),
      pedido_itens(preco_unitario),
      pedido_parcelas(numero, valor, vencimento)
    `)
    .eq('id', pedidoId)
    .maybeSingle()

  if (!pedido) return { ok: false, erro: 'Pedido não encontrado.' }

  const p = pedido as unknown as {
    numero: number
    total: number | string
    metragem_impressa: number | string | null
    forma_pagamento: string
    notas: string | null
    emitir_nf: boolean | null
    taxa_pagamento_percentual: number | string | null
    taxa_pagamento_fixa: number | string | null
    bling_pedido_id: number | null
    clientes: { razao_social: string; cnpj: string } | null
    pedido_itens: { preco_unitario: number | string | null }[]
    pedido_parcelas: {
      numero: number
      valor: number | string
      vencimento: string
    }[]
  }

  // Já enviado: não duplica pedido no ERP
  if (p.bling_pedido_id) {
    return { ok: true, blingId: p.bling_pedido_id, numero: null }
  }

  const metragem = p.metragem_impressa != null ? Number(p.metragem_impressa) : 0
  if (metragem <= 0) {
    return {
      ok: false,
      erro: 'Pedido sem metragem impressa — o romaneio precisa ser confirmado antes.',
    }
  }

  const precoMetro = Number(p.pedido_itens?.[0]?.preco_unitario ?? 0)
  if (precoMetro <= 0) {
    return { ok: false, erro: 'Pedido sem preço por metro definido.' }
  }

  const cnpj = (p.clientes?.cnpj ?? '').replace(/\D/g, '')
  if (!cnpj) return { ok: false, erro: 'Cliente sem CNPJ cadastrado.' }

  const config = await lerConfig()

  /* ---- contato: casado pelo documento, nunca criado automaticamente ---- */
  const rContato = await chamarBling(
    `/contatos?numeroDocumento=${encodeURIComponent(cnpj)}`
  )

  if (!rContato.ok) {
    return { ok: false, erro: `Falha ao buscar contato: ${rContato.erro.slice(0, 200)}` }
  }

  const contato = primeiro(rContato.dados)
  if (!contato?.id) {
    return {
      ok: false,
      erro: `Cliente ${p.clientes?.razao_social ?? ''} (CNPJ ${cnpj}) não existe no Bling. Cadastre-o lá e tente de novo.`,
    }
  }

  await pausa()

  /* ---- produto genérico de estampa, cobrado por metro ---- */
  const rProduto = await chamarBling(
    `/produtos?codigo=${encodeURIComponent(config.produtoEstampaCodigo)}`
  )

  if (!rProduto.ok) {
    return { ok: false, erro: `Falha ao buscar produto: ${rProduto.erro.slice(0, 200)}` }
  }

  const produto = primeiro(rProduto.dados)
  if (!produto?.id) {
    return {
      ok: false,
      erro: `Produto de código "${config.produtoEstampaCodigo}" não existe no Bling. Crie-o (unidade em metros) ou ajuste a configuração.`,
    }
  }

  /* ---- a taxa da forma de pagamento vira "outras despesas" ---- */
  const valorMercadoria = Number(p.total)

  const parcelas = (p.pedido_parcelas ?? [])
    .slice()
    .sort((a, b) => a.numero - b.numero)

  const taxa = taxaDoPedido(
    valorMercadoria,
    Number(p.taxa_pagamento_percentual ?? 0),
    Number(p.taxa_pagamento_fixa ?? 0),
    p.forma_pagamento,
    parcelas.length || 1
  )

  const hoje = new Date().toISOString().slice(0, 10)

  const corpo: Record<string, unknown> = {
    data: hoje,
    contato: { id: contato.id },
    // O número do pedido no portal é o que liga os dois sistemas na conferência
    numeroPedidoCompra: String(p.numero),
    // O aviso vem primeiro de propósito: é a observação que quem fatura no
    // Bling precisa ver antes de emitir a nota
    observacoes: [
      p.emitir_nf === false ? '*** SEM NOTA FISCAL ***' : null,
      `Portal — pedido #${p.numero}`,
      p.notas?.trim(),
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 500),
    itens: [
      {
        codigo: config.produtoEstampaCodigo,
        descricao: `Estampa sublimática — ${metragem.toLocaleString('pt-BR')} m`,
        unidade: 'm',
        quantidade: metragem,
        valor: precoMetro,
        produto: { id: produto.id },
      },
    ],
    // Sem isto o total do Bling não fecharia com os boletos
    outrasDespesas: taxa,
  }

  // É a forma de pagamento da parcela que faz o Bling gerar boleto ou Pix
  const formaBling =
    p.forma_pagamento === 'pix'
      ? config.formaPagamentoPixId
      : config.formaPagamentoId

  if (parcelas.length > 0) {
    corpo.parcelas = parcelas.map((pc) => ({
      dataVencimento: String(pc.vencimento).slice(0, 10),
      valor: Number(pc.valor),
      ...(formaBling ? { formaPagamento: { id: formaBling } } : {}),
    }))
  } else {
    // À vista (Pix, boleto único, cartão): uma parcela com o total cobrado
    const total = Math.round((valorMercadoria + taxa) * 100) / 100
    corpo.parcelas = [
      {
        dataVencimento: hoje,
        valor: total,
        ...(formaBling ? { formaPagamento: { id: formaBling } } : {}),
      },
    ]
  }

  await pausa()

  const rCriar = await chamarBling('/pedidos/vendas', {
    method: 'POST',
    body: JSON.stringify(corpo),
  })

  if (!rCriar.ok) {
    return { ok: false, erro: `Falha ao criar pedido: ${rCriar.erro.slice(0, 400)}` }
  }

  const criado = (rCriar.dados as { data?: { id?: number; numero?: number } })?.data

  if (!criado?.id) {
    return { ok: false, erro: 'O Bling aceitou a chamada mas não devolveu o id do pedido.' }
  }

  return { ok: true, blingId: criado.id, numero: criado.numero ?? null }
}

/**
 * Envia e registra o resultado no próprio pedido.
 * Nunca lança: o lançamento da etapa não pode depender do ERP estar no ar.
 */
export async function sincronizarPedidoComBling(pedidoId: string) {
  const admin = createAdminClient()

  let resultado: Sucesso | Falha
  try {
    resultado = await criarPedidoNoBling(pedidoId)
  } catch (e) {
    resultado = {
      ok: false,
      erro: e instanceof Error ? e.message : 'Erro desconhecido ao falar com o Bling.',
    }
  }

  if (resultado.ok) {
    await admin
      .from('pedidos')
      .update({
        bling_pedido_id: resultado.blingId,
        bling_numero: resultado.numero,
        bling_sync_status: 'ok',
        bling_erro: null,
      })
      .eq('id', pedidoId)
    return
  }

  // Conta as tentativas para dar a quem for reprocessar uma ideia do histórico
  const { data } = await admin
    .from('pedidos')
    .select('bling_tentativas')
    .eq('id', pedidoId)
    .maybeSingle()

  await admin
    .from('pedidos')
    .update({
      bling_sync_status: 'erro',
      bling_erro: resultado.erro.slice(0, 500),
      bling_tentativas: Number(data?.bling_tentativas ?? 0) + 1,
    })
    .eq('id', pedidoId)
}

/* ------------------------------ cancelamento ------------------------------ */

/**
 * Id da situação "Cancelado" do módulo de vendas. Resolvido pelo nome, porque
 * os ids são da conta — hardcode quebraria em outra conta do Bling.
 */
async function situacaoCancelado(): Promise<number | null> {
  const mods = await chamarBling('/situacoes/modulos')
  if (!mods.ok) return null

  const lista = ((mods.dados as { data?: { id: number; nome: string }[] })?.data ?? [])
  const vendas = lista.find((m) => /venda/i.test(String(m.nome)))
  if (!vendas) return null

  await pausa()
  const sits = await chamarBling(`/situacoes/modulos/${vendas.id}`)
  if (!sits.ok) return null

  const situacoes = ((sits.dados as { data?: { id: number; nome: string }[] })?.data ?? [])
  const cancelado = situacoes.find((x) => /cancelad/i.test(String(x.nome)))
  return cancelado ? Number(cancelado.id) : null
}

/**
 * Cancela no Bling o pedido de venda que espelha este pedido. Muda a situação
 * para "Cancelado" — mantém o histórico lá; apagar só como último recurso,
 * quando a conta não tem essa situação.
 *
 * Nunca lança. O cancelamento no portal já aconteceu; o que sobrar de
 * divergência fica em `bling_erro`, que a tela do pedido mostra.
 */
export async function cancelarPedidoNoBling(pedidoId: string): Promise<void> {
  const admin = createAdminClient()

  try {
    const { data } = await admin
      .from('pedidos')
      .select('bling_pedido_id, nf_numero')
      .eq('id', pedidoId)
      .maybeSingle()

    const blingId = Number(data?.bling_pedido_id ?? 0)
    if (!blingId) return

    let erro: string | null = null

    const sit = await situacaoCancelado()
    await pausa()

    if (sit) {
      const r = await chamarBling(`/pedidos/vendas/${blingId}/situacoes/${sit}`, { method: 'PATCH' })
      if (!r.ok) erro = r.erro.slice(0, 300)
    } else {
      const r = await chamarBling(`/pedidos/vendas/${blingId}`, { method: 'DELETE' })
      if (!r.ok) erro = r.erro.slice(0, 300)
    }

    if (erro) {
      await admin
        .from('pedidos')
        .update({
          bling_erro: `Cancelado no portal, mas não no Bling: ${erro}` +
            (data?.nf_numero ? ` — a NF ${data.nf_numero} precisa ser cancelada no Bling.` : ''),
        })
        .eq('id', pedidoId)
    } else if (data?.nf_numero) {
      // O pedido de venda cancelou, mas nota emitida é assunto da SEFAZ e
      // não tem endpoint: quem cancela é a equipe, no Bling
      await admin
        .from('pedidos')
        .update({ bling_erro: `Pedido cancelado no Bling. A NF ${data.nf_numero} precisa ser cancelada lá, manualmente.` })
        .eq('id', pedidoId)
    }
  } catch (e) {
    console.error('[bling cancelar]', pedidoId, e)
  }
}
