import { templateInterno } from './interno'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Aviso interno: ao faturar, o boleto escolhido passou do limite de crédito
 * do cliente e o pedido ficou bloqueado aguardando decisão (liberar com
 * motivo ou trocar a forma). Vai para a lista de "pedido bloqueado por
 * crédito" em Configurações → Avisos.
 */
export function templateBloqueioCredito({
  numero,
  cliente,
  forma,
  valorPedido,
  emUso,
  limite,
  urlPedido,
}: {
  numero: number
  cliente: string
  forma: string
  valorPedido: number
  emUso: number
  limite: number
  urlPedido: string
}) {
  const excedente = Math.max(0, emUso + valorPedido - limite)

  return templateInterno({
    titulo: `Pedido #${numero} bloqueado por limite de crédito`,
    linhas: [
      { rotulo: 'Cliente', valor: cliente },
      { rotulo: 'Pagamento', valor: forma },
      { rotulo: 'Valor do pedido', valor: `R$ ${brl(valorPedido)}` },
      { rotulo: 'Já em boletos', valor: `R$ ${brl(emUso)}` },
      { rotulo: 'Limite', valor: `R$ ${brl(limite)}` },
      { rotulo: 'Passa do limite em', valor: `R$ ${brl(excedente)}` },
    ],
    texto:
      'O faturamento parou nesta escolha. Para seguir em boleto, abra o pedido e libere o limite com motivo no bloco Faturar; ' +
      'ou escolha outra forma de pagamento (Pix, cartão) e fature.',
    urlAcao: urlPedido,
    rotuloAcao: 'ABRIR O PEDIDO',
  })
}
