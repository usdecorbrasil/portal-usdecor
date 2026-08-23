export function templateEmProducao({
  clienteNome,
  numero,
  urlPedido,
}: {
  clienteNome: string
  numero: number
  urlPedido: string
}) {
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
              <span style="color:#FFFFFF; font-size:20px; font-weight:bold; letter-spacing:-0.5px;">Bello Tecido</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="font-size:18px; color:#131A2E; margin: 0 0 16px;">Olá, ${clienteNome}</h1>
              <p style="font-size:14px; color:#131A2E; line-height:1.6; margin: 0 0 20px;">
                Seu pedido <strong style="font-family: monospace;">#${numero}</strong> entrou em produção — a estampagem começou.
              </p>
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
                Você será avisado quando o pedido estiver pronto.
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