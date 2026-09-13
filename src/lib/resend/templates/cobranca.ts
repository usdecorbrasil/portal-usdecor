const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dataBr = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')

export type CobrancaEmail = {
  numero: number
  valor: number
  vencimento: string
  linkBoleto: string | null
  linkPix: string | null
}

/**
 * Cobrança gerada: boleto(s) ou Pix. Boleto vai anexado quando o PDF foi
 * baixado; o link fica de qualquer jeito, porque é ele que o banco do cliente
 * lê. Pix é só link — o QR Code está na página do Bling.
 */
export function templateCobranca({
  clienteNome,
  numero,
  rotuloPagamento,
  cobrancas,
  totalCobrado,
  urlPedido,
}: {
  clienteNome: string
  numero: number
  rotuloPagamento: string
  cobrancas: CobrancaEmail[]
  totalCobrado: number
  urlPedido: string
}) {
  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const linhas = cobrancas
    .map(
      (c, i) => `
        <tr>
          <td style="padding: 10px 14px; border-top:${i === 0 ? '0' : '1px solid #EFEEE8'};">
            <span style="font-size:13px; color:#131A2E; font-family: monospace;">${c.numero}/${cobrancas.length}</span>
            <span style="font-size:12px; color:#6E6E68;"> &middot; vence ${dataBr(c.vencimento)}</span>
            ${c.linkBoleto ? `<br><a href="${c.linkBoleto}" style="font-size:12px; color:#B4005F; font-weight:bold; text-decoration:none;">Abrir boleto &rsaquo;</a>` : ''}
            ${c.linkPix ? `<br><a href="${c.linkPix}" style="font-size:12px; color:#B4005F; font-weight:bold; text-decoration:none;">Pagar com Pix &rsaquo;</a>` : ''}
          </td>
          <td align="right" style="padding: 10px 14px; border-top:${i === 0 ? '0' : '1px solid #EFEEE8'}; font-size:13px; color:#131A2E; font-family: monospace; font-weight:bold; white-space:nowrap;">
            R$ ${brl(c.valor)}
          </td>
        </tr>`
    )
    .join('')

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
              <h1 style="font-size:18px; color:#131A2E; margin: 0 0 16px;">Olá, ${escapar(clienteNome)}</h1>
              <p style="font-size:14px; color:#131A2E; line-height:1.6; margin: 0 0 20px;">
                Segue a cobrança do pedido <strong style="font-family: monospace;">#${numero}</strong>
                &mdash; ${escapar(rotuloPagamento)}, total de <strong style="font-family: monospace;">R$ ${brl(totalCobrado)}</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DDDCD5; border-radius:4px;">
                ${linhas}
              </table>

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
