/**
 * Convite de acesso — e também a redefinição de senha pelo painel, que é o
 * mesmo e-mail com outra primeira frase: nos dois casos a pessoa recebe uma
 * senha provisória e vai criar a dela no próximo login.
 */
export function templateConviteAcesso({
  nome,
  email,
  senha,
  urlLogin,
  redefinida = false,
}: {
  nome: string
  email: string
  senha: string
  urlLogin: string
  redefinida?: boolean
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
              <span style="color:#FFFFFF; font-size:20px; font-weight:bold; letter-spacing:-0.5px;">US Decor</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="font-size:18px; color:#131A2E; margin: 0 0 16px;">Olá, ${nome}</h1>
              <p style="font-size:14px; color:#131A2E; line-height:1.6; margin: 0 0 20px;">
                ${
                  redefinida
                    ? 'Sua senha de acesso ao portal US Decor foi redefinida. Use os dados abaixo para entrar:'
                    : 'Seu acesso ao portal US Decor foi criado. Use os dados abaixo para entrar:'
                }
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7; border:1px solid #DDDCD5; border-radius:4px; margin-bottom:24px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="font-size:12px; color:#6E6E68; margin:0 0 4px; letter-spacing:0.05em;">E-MAIL</p>
                    <p style="font-size:14px; color:#131A2E; margin:0 0 16px; font-family: monospace;">${email}</p>
                    <p style="font-size:12px; color:#6E6E68; margin:0 0 4px; letter-spacing:0.05em;">SENHA PROVISÓRIA</p>
                    <p style="font-size:14px; color:#131A2E; margin:0; font-family: monospace; font-weight:bold;">${senha}</p>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#131A2E; border-radius:4px;">
                    <a href="${urlLogin}" style="display:inline-block; padding: 12px 28px; color:#FFFFFF; font-size:14px; font-weight:bold; text-decoration:none;">
                      ACESSAR O PORTAL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:12px; color:#6E6E68; line-height:1.6; margin: 24px 0 0;">
                Esta senha vale só para entrar da primeira vez: o portal vai pedir que
                você crie a sua antes de continuar.
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