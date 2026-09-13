export type ItemEmail = {
  sku: string
  nome: string
  quantidade: number
}

/**
 * E-mail de "pedido confirmado", quando a equipe libera a produção.
 *
 * Mostra as artes e quantidades, não o valor: nesta etapa o valor ainda não
 * existe — ele é metragem × preço/metro, e a metragem só aparece depois da
 * estampa. O cliente vê valor no e-mail de "Pedido pronto", que é a cobrança.
 */
export function templatePedidoConfirmado({
  clienteNome,
  numero,
  itens,
  urlPedido,
}: {
  clienteNome: string
  numero: number
  itens: ItemEmail[]
  urlPedido: string
}) {
  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const unidades = itens.reduce((a, i) => a + i.quantidade, 0)

  const linhas = itens
    .map(
      (i, idx) => `
        <tr>
          <td style="padding: 8px 0; border-top:${idx === 0 ? '0' : '1px solid #EFEEE8'}; vertical-align:top;">
            <span style="font-size:11px; color:#6E6E68; font-family: monospace;">${escapar(i.sku)}</span><br>
            <span style="font-size:13px; color:#131A2E;">${escapar(i.nome)}</span>
          </td>
          <td align="right" style="padding: 8px 0 8px 16px; border-top:${idx === 0 ? '0' : '1px solid #EFEEE8'}; font-size:13px; color:#131A2E; font-family: monospace; white-space:nowrap; vertical-align:top;">
            ${i.quantidade} un
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
                Seu pedido <strong style="font-family: monospace;">#${numero}</strong> foi confirmado e já entra na fila de produção.
              </p>

              <p style="font-size:12px; color:#6E6E68; margin:0 0 8px; letter-spacing:0.05em;">ARTES DO PEDIDO</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7; border:1px solid #DDDCD5; border-radius:4px; padding: 6px 16px; margin-bottom:8px;">
                ${linhas}
              </table>
              <p style="font-size:12px; color:#6E6E68; margin:0 0 24px; text-align:right;">
                ${itens.length} ${itens.length === 1 ? 'arte' : 'artes'} · ${unidades} ${unidades === 1 ? 'unidade' : 'unidades'}
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
                O valor é definido ao fim da estampa, pela metragem realmente impressa, e chega em outro e-mail. Você será avisado a cada etapa.
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
