const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dataBr = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')

export type ParcelaEmail = {
  numero: number
  valor: number
  vencimento: string
  linhaDigitavel: string | null
  /** Link do QR Code do Pix, quando a cobrança é por Pix. */
  linkPix: string | null
  /** Link do boleto no Bling, quando a cobrança é por boleto. */
  linkBoleto: string | null
}

/**
 * E-mail de cobrança, disparado quando a etapa "Pedido pronto" é lançada.
 *
 * É o e-mail que fecha o ciclo comercial: até aqui o cliente só foi avisado do
 * andamento, e é neste que ele descobre quanto deve e como pagar. Por isso o
 * valor e o vencimento vêm antes de qualquer outra coisa.
 *
 * Degrada de propósito: enquanto os boletos não são emitidos pelo Bling, a
 * linha digitável vem nula e o e-mail avisa que ela chega em seguida, em vez
 * de mostrar um espaço vazio.
 */
export function templatePedidoPronto({
  clienteNome,
  numero,
  metragem,
  valorMercadoria,
  taxa,
  totalCobrado,
  rotuloPagamento,
  parcelas,
  urlPedido,
}: {
  clienteNome: string
  numero: number
  metragem: number | null
  valorMercadoria: number
  taxa: number
  totalCobrado: number
  rotuloPagamento: string
  parcelas: ParcelaEmail[]
  urlPedido: string
}) {
  const linhaResumo = (rotulo: string, valor: string, forte = false) => `
    <tr>
      <td style="padding: 4px 0; font-size:13px; color:${forte ? '#131A2E' : '#6E6E68'};">
        ${rotulo}
      </td>
      <td align="right" style="padding: 4px 0; font-size:${forte ? '16px' : '13px'}; color:#131A2E; font-family: monospace; ${forte ? 'font-weight:bold;' : ''}">
        ${valor}
      </td>
    </tr>`

  const blocoParcelas =
    parcelas.length > 0
      ? `
      <p style="font-size:12px; color:#6E6E68; margin:24px 0 8px; letter-spacing:0.05em;">PARCELAS</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DDDCD5; border-radius:4px;">
        ${parcelas
          .map(
            (p, i) => `
        <tr>
          <td style="padding: 10px 14px; border-top:${i === 0 ? '0' : '1px solid #EFEEE8'};">
            <span style="font-size:13px; color:#131A2E; font-family: monospace;">${p.numero}/${parcelas.length}</span>
            <span style="font-size:12px; color:#6E6E68;"> &middot; vence ${dataBr(p.vencimento)}</span>
            ${
              p.linhaDigitavel
                ? `<br><span style="font-size:11px; color:#6E6E68; font-family: monospace; word-break:break-all;">${p.linhaDigitavel}</span>`
                : ''
            }
            ${
              p.linkPix
                ? `<br><a href="${p.linkPix}" style="font-size:12px; color:#B4005F; font-weight:bold; text-decoration:none;">Pagar com Pix &rsaquo;</a>`
                : ''
            }
            ${
              p.linkBoleto
                ? `<br><a href="${p.linkBoleto}" style="font-size:12px; color:#B4005F; font-weight:bold; text-decoration:none;">Abrir boleto &rsaquo;</a>`
                : ''
            }
          </td>
          <td align="right" style="padding: 10px 14px; border-top:${i === 0 ? '0' : '1px solid #EFEEE8'}; font-size:13px; color:#131A2E; font-family: monospace; font-weight:bold; white-space:nowrap;">
            R$ ${brl(p.valor)}
          </td>
        </tr>`
          )
          .join('')}
      </table>`
      : ''

  // Nenhuma parcela trouxe forma de pagar: avisa em vez de deixar o cliente
  // sem saber como quitar
  const semCobranca =
    parcelas.length > 0 &&
    parcelas.every((p) => !p.linhaDigitavel && !p.linkPix && !p.linkBoleto)

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#F2F1ED; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F1ED; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border-radius:4px; overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(103deg,#D8007A 0%,#B4005F 100%); padding: 24px 32px;">
              <span style="color:#FFFFFF; font-size:20px; font-weight:bold; letter-spacing:-0.5px;">Best Color Tecidos</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="font-size:18px; color:#131A2E; margin: 0 0 16px;">Olá, ${clienteNome}</h1>
              <p style="font-size:14px; color:#131A2E; line-height:1.6; margin: 0 0 20px;">
                Seu pedido <strong style="font-family: monospace;">#${numero}</strong> está pronto.
                Abaixo está o valor final, calculado pela metragem realmente impressa.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7; border:1px solid #DDDCD5; border-radius:4px; margin-bottom:8px;">
                <tr>
                  <td style="padding: 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${metragem !== null ? linhaResumo('Metragem impressa', `${brl(metragem)} m`) : ''}
                      ${linhaResumo('Produtos', `R$ ${brl(valorMercadoria)}`)}
                      ${taxa > 0 ? linhaResumo(rotuloPagamento, `+ R$ ${brl(taxa)}`) : ''}
                      <tr><td colspan="2" style="padding: 8px 0 0; border-top:1px solid #DDDCD5;"></td></tr>
                      ${linhaResumo('Total', `R$ ${brl(totalCobrado)}`, true)}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px; color:#6E6E68; margin:0 0 4px;">
                Pagamento: ${rotuloPagamento}
              </p>

              ${blocoParcelas}

              ${
                semCobranca
                  ? `<p style="font-size:12px; color:#6E6E68; line-height:1.6; margin: 16px 0 0;">
                       Os dados para pagamento serão enviados em seguida, em mensagem separada.
                     </p>`
                  : ''
              }

              <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background-color:#131A2E; border-radius:4px;">
                    <a href="${urlPedido}" style="display:inline-block; padding: 12px 28px; color:#FFFFFF; font-size:14px; font-weight:bold; text-decoration:none;">
                      VER PEDIDO
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px; color:#6E6E68; line-height:1.6; margin: 24px 0 0;">
                Em caso de dúvida sobre a cobrança, basta responder a este e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
