export function templatePedidoConfirmado({
  clienteNome,
  numero,
  total,
  urlPedido,
}: {
  clienteNome: string
  numero: number
  total: number
  urlPedido: string
}) {
  const brl = total.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

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
                Seu pedido foi confirmado e já entra na fila de produção.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7; border:1px solid #DDDCD5; border-radius:4px; margin-bottom:24px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="font-size:12px; color:#6E6E68; margin:0 0 4px; letter-spacing:0.05em;">PEDIDO</p>
                    <p style="font-size:14px; color:#131A2E; margin:0 0 16px; font-family: monospace; font-weight:bold;">#${numero}</p>
                    <p style="font-size:12px; color:#6E6E68; margin:0 0 4px; letter-spacing:0.05em;">TOTAL</p>
                    <p style="font-size:14px; color:#131A2E; margin:0; font-family: monospace;">R$ ${brl}</p>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#131A2E; border-radius:4px;">
                    <a href="${urlPedido}" style="display:inline-block; padding: 12px 28px; color:#FFFFFF; font-size:14px; font-weight:bold; text-decoration:none;">
                      ACOMPANHAR PEDIDO
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:12px; color:#6E6E68; line-height:1.6; margin: 24px 0 0;">
                Você será avisado a cada etapa importante do processo.
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