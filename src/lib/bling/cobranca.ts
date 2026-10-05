import 'server-only'
import { chamarBling } from './cliente'

/**
 * Cobrança no Bling.
 *
 * Não existe endpoint para "gerar boleto": o que existe é `lancar-contas`, que
 * transforma as parcelas do pedido de venda em **contas a receber**. Quando a
 * forma de pagamento dessas contas é do Bling Conta, o próprio Bling emite o
 * boleto ou o Pix e expõe os links em `linkBoleto` / `linkQRCodePix` na conta.
 * Daí a leitura ser sempre nas contas a receber, e nunca no pedido.
 */

export type LinkCobranca = {
  contaId: number | null
  valor: number
  vencimento: string
  pix: string | null
  boleto: string | null
}

type Conta = {
  id?: number
  vencimento?: string
  valor?: number
  linkQRCodePix?: string
  linkBoleto?: string
  contato?: { id?: number }
  origem?: { id?: number; tipoOrigem?: string; numero?: string }
}

const PAUSA_MS = 400
const pausa = (ms = PAUSA_MS) => new Promise((r) => setTimeout(r, ms))

/**
 * Lança as contas a receber do pedido de venda. O Bling responde 204 na
 * primeira vez e recusa se já estiverem lançadas — o segundo caso não é erro
 * para nós: as contas existem, que é o que importa.
 */
export async function lancarContas(
  blingPedidoId: number
): Promise<{ ok: true; jaLancadas: boolean } | { ok: false; erro: string }> {
  const r = await chamarBling(`/pedidos/vendas/${blingPedidoId}/lancar-contas`, {
    method: 'POST',
  })

  if (r.ok) return { ok: true, jaLancadas: false }

  const texto = r.erro.toLowerCase()
  if (
    r.status === 400 &&
    (texto.includes('lançad') || texto.includes('lancad') || texto.includes('já'))
  ) {
    return { ok: true, jaLancadas: true }
  }

  return { ok: false, erro: `Falha ao lançar as contas: ${r.erro.slice(0, 300)}` }
}

function lerConta(c: Conta): LinkCobranca {
  const pix = (c.linkQRCodePix ?? '').trim()
  const boleto = (c.linkBoleto ?? '').trim()
  return {
    contaId: c.id ?? null,
    valor: Number(c.valor ?? 0),
    vencimento: String(c.vencimento ?? '').slice(0, 10),
    pix: pix || null,
    boleto: boleto || null,
  }
}

/**
 * Contas a receber do contato que nasceram deste pedido de venda. Casa por
 * `origem.id` quando o Bling preenche; senão, por vencimento + valor, que é o
 * par que identifica a parcela.
 */
export async function buscarCobrancasDoPedido(
  contatoId: number,
  blingPedidoId: number,
  esperados: { valor: number; vencimento: string }[]
): Promise<LinkCobranca[]> {
  if (!contatoId) return []

  const r = await chamarBling(
    `/contas/receber?idsContatos[]=${contatoId}&situacoes[]=1&situacoes[]=3&limite=100`
  )
  if (!r.ok) return []

  const contas = ((r.dados as { data?: Conta[] })?.data ?? []) as Conta[]

  const porOrigem = contas.filter((c) => Number(c.origem?.id ?? 0) === blingPedidoId)
  if (blingPedidoId && porOrigem.length > 0) return porOrigem.map(lerConta)

  const achados: LinkCobranca[] = []
  for (const alvo of esperados) {
    const conta = contas.find(
      (c) =>
        String(c.vencimento ?? '').slice(0, 10) === alvo.vencimento &&
        Math.abs(Number(c.valor ?? 0) - alvo.valor) < 0.01
    )
    if (conta) achados.push(lerConta(conta))
  }
  return achados
}

/**
 * Lança as contas e espera os links aparecerem. O Bling Conta emite o boleto
 * logo depois do lançamento, mas não no mesmo instante — algumas tentativas
 * com pausa cobrem o normal.
 */
export async function gerarEObterCobrancas(
  contatoId: number,
  blingPedidoId: number,
  esperados: { valor: number; vencimento: string }[]
): Promise<
  | { ok: true; cobrancas: LinkCobranca[]; semLinks: boolean }
  | { ok: false; erro: string }
> {
  const l = await lancarContas(blingPedidoId)
  if (!l.ok) return l

  let cobrancas: LinkCobranca[] = []
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    await pausa(tentativa === 0 ? PAUSA_MS : 1500)
    cobrancas = await buscarCobrancasDoPedido(contatoId, blingPedidoId, esperados)
    if (cobrancas.length > 0 && cobrancas.every((c) => c.boleto || c.pix)) break
  }

  return {
    ok: true,
    cobrancas,
    semLinks: cobrancas.length === 0 || cobrancas.some((c) => !c.boleto && !c.pix),
  }
}

/**
 * O e-mail de "Pedido pronto" ainda usa esta assinatura: links só pelo par
 * vencimento + valor, sem o vínculo com o pedido.
 */
export async function buscarLinksCobranca(
  contatoId: number,
  esperados: { valor: number; vencimento: string }[]
): Promise<LinkCobranca[]> {
  return buscarCobrancasDoPedido(contatoId, 0, esperados)
}

/**
 * Cartão: lança as contas a receber e lê o que o Bling criou, sem esperar
 * link — não há boleto nem Pix a emitir. A conta fica lá, com a forma de
 * pagamento do cartão, para o financeiro dar baixa quando o dinheiro cair.
 */
export async function lancarEObterContas(
  contatoId: number,
  blingPedidoId: number,
  esperados: { valor: number; vencimento: string }[]
): Promise<
  | { ok: true; contas: LinkCobranca[]; jaLancadas: boolean }
  | { ok: false; erro: string }
> {
  const l = await lancarContas(blingPedidoId)
  if (!l.ok) return l

  await pausa()
  const contas = await buscarCobrancasDoPedido(contatoId, blingPedidoId, esperados)
  return { ok: true, contas, jaLancadas: l.jaLancadas }
}
