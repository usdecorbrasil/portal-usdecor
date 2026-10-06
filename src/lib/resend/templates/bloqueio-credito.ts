import { templateInterno } from './interno'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Aviso interno: um pedido em boleto nasceu acima do limite de crédito do
 * cliente e ficou bloqueado aguardando decisão. Vai para a lista de
 * "pedido bloqueado por crédito" em Configurações → Avisos.
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
      { rotulo: 'Valor estimado', valor: `R$ ${brl(valorPedido)}` },
      { rotulo: 'Já em boletos', valor: `R$ ${brl(emUso)}` },
      { rotulo: 'Limite', valor: `R$ ${brl(limite)}` },
      { rotulo: 'Passa do limite em', valor: `R$ ${brl(excedente)}` },
    ],
    texto:
      'O pedido ficou em "aguardando confirmação" e o cliente foi avisado de que a equipe entrará em contato. ' +
      'Para seguir, abra o pedido e libere com motivo; para não seguir, cancele ou combine outra forma de pagamento.',
    urlAcao: urlPedido,
    rotuloAcao: 'ABRIR O PEDIDO',
  })
}
