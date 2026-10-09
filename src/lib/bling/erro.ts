/**
 * Transforma a resposta de erro do Bling em texto para quem está na tela.
 *
 * O Bling devolve `{"error":{"type","message","description","fields":[{"msg",
 * "element"}]}}`. Antes o portal gravava esse JSON cru, cortado em 400
 * caracteres — e o motivo de verdade, que vem em `fields`, era o que ficava
 * de fora. Puro, sem dependências: dá para testar e usar em qualquer lugar.
 */

type CampoErro = { msg?: unknown; element?: unknown; code?: unknown }

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const POR_STATUS: Record<number, string> = {
  401: 'O Bling recusou o acesso (token inválido ou expirado). Reconecte o Bling em Configurações.',
  403: 'O Bling recusou a operação: a conta conectada não tem permissão para isso.',
  404: 'O Bling não encontrou o registro pedido.',
  429: 'O Bling limitou as chamadas por excesso de requisições. Aguarde alguns segundos e tente de novo.',
}

export function erroLegivel(status: number, dados: unknown): string {
  const erro =
    typeof dados === 'object' && dados !== null
      ? ((dados as { error?: unknown }).error as Record<string, unknown> | undefined)
      : undefined

  if (erro && typeof erro === 'object') {
    const bruto = erro.fields
    const lista: CampoErro[] = Array.isArray(bruto)
      ? (bruto as CampoErro[])
      : bruto && typeof bruto === 'object'
      ? (Object.values(bruto) as CampoErro[])
      : []

    const campos = lista
      .map((c) => {
        const msg = texto(c?.msg)
        const onde = texto(c?.element)
        return msg ? (onde && !msg.toLowerCase().includes(onde.toLowerCase()) ? `${msg} (${onde})` : msg) : ''
      })
      .filter(Boolean)

    const titulo = texto(erro.description) || texto(erro.message)
    const partes = [titulo, ...campos.filter((c) => c !== titulo)].filter(Boolean)
    if (partes.length) return `${partes.join(' — ')} [HTTP ${status}]`
  }

  if (POR_STATUS[status]) return `${POR_STATUS[status]} [HTTP ${status}]`

  const cru = typeof dados === 'string' ? dados : dados != null ? JSON.stringify(dados) : ''
  return (cru.trim() || `Erro HTTP ${status}`).slice(0, 400) + (cru ? ` [HTTP ${status}]` : '')
}
