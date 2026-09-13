/**
 * E-mail interno, para a equipe. Sem saudação nem tom de atendimento: quem
 * recebe é quem opera o portal, e o que interessa é o fato e o botão para
 * agir. Serve a todos os avisos internos — muda o título, as linhas e o link.
 */
export function templateInterno({
  titulo,
  linhas,
  texto,
  urlAcao,
  rotuloAcao,
}: {
  titulo: string
  linhas: { rotulo: string; valor: string }[]
  texto?: string
  urlAcao: string
  rotuloAcao: string
}) {
  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const tabela = linhas
    .map(
      (l) => `
        <tr>
          <td style="padding: 5px 0; font-size:12px; color:#6E6E68; white-space:nowrap; vertical-align:top;">${escapar(l.rotulo)}</td>
          <td style="padding: 5px 0 5px 16px; font-size:13px; color:#131A2E; vertical-align:top;">${escapar(l.valor)}</td>
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
            <td style="background-color:#131A2E; padding: 18px 32px;">
              <span style="color:#FFFFFF; font-size:11px; letter-spacing:0.16em;">AVISO INTERNO · PORTAL</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px;">
              <h1 style="font-size:18px; color:#131A2E; margin: 0 0 16px;">${escapar(titulo)}</h1>

              <table cellpadding="0" cellspacing="0" style="background-color:#FAFAF7; border:1px solid #DDDCD5; border-radius:4px; padding: 10px 16px; width:100%;">
                ${tabela}
              </table>

              ${
                texto
                  ? `<p style="font-size:13px; color:#131A2E; line-height:1.6; margin: 16px 0 0; white-space:pre-line;">${escapar(texto)}</p>`
                  : ''
              }

              <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background-color:#131A2E; border-radius:4px;">
                    <a href="${urlAcao}" style="display:inline-block; padding: 12px 28px; color:#FFFFFF; font-size:14px; font-weight:bold; text-decoration:none;">
                      ${escapar(rotuloAcao)}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:11px; color:#9B9A93; line-height:1.6; margin: 24px 0 0;">
                Você recebe este aviso porque seu e-mail está em Configurações → Notificações.
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
