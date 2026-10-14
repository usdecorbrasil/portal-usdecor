/**
 * Link para criar nova senha, pedido pelo administrador em Configurações → Equipe.
 *
 * Substitui o modelo antigo de "senha provisória gerada e mostrada na tela":
 * ninguém da equipe vê nem transporta a senha — a própria pessoa cria a dela.
 */
export function templateRedefinirSenha({
  nome,
  email,
  urlLink,
}: {
  nome: string
  email: string
  urlLink: string
}) {
  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
              <h1 style="font-size:18px; color:#131A2E; margin: 0 0 16px;">Olá, ${escapar(nome)}</h1>
              <p style="font-size:14px; color:#131A2E; line-height:1.6; margin: 0 0 20px;">
                A US Decor pediu uma nova senha para o seu acesso ao portal
                (<span style="font-family: monospace;">${escapar(email)}</span>).
                Clique abaixo para criar a sua:
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#131A2E; border-radius:4px;">
                    <a href="${urlLink}" style="display:inline-block; padding: 12px 28px; color:#FFFFFF; font-size:14px; font-weight:bold; text-decoration:none;">
                      CRIAR NOVA SENHA
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:12px; color:#6E6E68; line-height:1.6; margin: 24px 0 0;">
                O link vale por uma hora e só pode ser usado uma vez. Se você não esperava
                este e-mail, pode ignorá-lo — sua senha atual continua valendo.
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
