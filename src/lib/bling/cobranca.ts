import 'server-only'
import { chamarBling } from './cliente'

/**
 * Busca no Bling os links de pagamento gerados para um pedido.
 *
 * O link do Pix e o do boleto não ficam no pedido de venda: nascem nas
 * **contas a receber** que o Bling cria a partir dele, em `linkQRCodePix` e
 * `linkBoleto`. Por isso a busca é por contato e valor, e não pelo pedido.
 */

export type LinkCobranca = {
  valor: number
  vencimento: string
  pix: string | null
  boleto: string | null
}

type Conta = {
  vencimento?: string
  valor?: number
  linkQRCodePix?: string
  linkBoleto?: string
  contato?: { id?: number }
}

/**
 * Devolve os links das contas a receber do contato que batem com os valores
 * esperados. Lista vazia não é erro: o Bling pode ainda não ter gerado a
 * cobrança quando o pedido acabou de ser criado.
 */
export async function buscarLinksCobranca(
  contatoId: number,
  esperados: { valor: number; vencimento: string }[]
): Promise<LinkCobranca[]> {
  if (!contatoId || esperados.length === 0) return []

  const r = await chamarBling(
    `/contas/receber?idsContatos[]=${contatoId}&situacoes[]=1&limite=100`
  )

  if (!r.ok) return []

  const contas = ((r.dados as { data?: Conta[] })?.data ?? []) as Conta[]

  const achados: LinkCobranca[] = []

  for (const alvo of esperados) {
    // Casa por vencimento e valor: é o par que identifica a parcela sem
    // depender de um vínculo que o Bling não expõe de forma confiável
    const conta = contas.find(
      (c) =>
        String(c.vencimento ?? '').slice(0, 10) === alvo.vencimento &&
        Math.abs(Number(c.valor ?? 0) - alvo.valor) < 0.01
    )

    if (!conta) continue

    const pix = (conta.linkQRCodePix ?? '').trim()
    const boleto = (conta.linkBoleto ?? '').trim()

    if (!pix && !boleto) continue

    achados.push({
      valor: alvo.valor,
      vencimento: alvo.vencimento,
      pix: pix || null,
      boleto: boleto || null,
    })
  }

  return achados
}
