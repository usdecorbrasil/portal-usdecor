/**
 * Avisos internos: quem da equipe recebe e-mail quando algo acontece.
 *
 * Puro de propósito (sem Supabase), como `pagamento/config.ts`: a tela de
 * Configurações roda no navegador e precisa das mesmas regras que o servidor
 * usa para validar.
 *
 * Vive numa chave só de `configuracoes` (`notificacoes`), em JSON — um
 * objeto tipo → lista de e-mails. Guardar isso no código obrigaria a subir
 * deploy toda vez que entrasse um segundo administrador.
 */

export const TIPOS = [
  'pedido_novo',
  'pedido_bloqueado_credito',
  'pedido_cancelado',
  'cancelamento_solicitado',
  'tecido_enviado',
] as const

export type TipoNotificacao = (typeof TIPOS)[number]

export const ROTULOS: Record<TipoNotificacao, { titulo: string; descricao: string }> = {
  pedido_novo: {
    titulo: 'Pedido novo',
    descricao: 'Quando qualquer cliente envia um pedido pelo carrinho.',
  },
  pedido_bloqueado_credito: {
    titulo: 'Pedido bloqueado por limite de crédito',
    descricao:
      'Quando, no Faturar, o boleto escolhido passa do limite de crédito do cliente e o pedido fica aguardando liberação ou outra forma. Exige decisão.',
  },
  pedido_cancelado: {
    titulo: 'Pedido cancelado pelo cliente',
    descricao:
      'Quando o cliente cancela um pedido que ainda aguardava confirmação. Não exige resposta.',
  },
  cancelamento_solicitado: {
    titulo: 'Cancelamento solicitado',
    descricao: 'Quando um cliente pede para cancelar um pedido já confirmado. Exige resposta.',
  },
  tecido_enviado: {
    titulo: 'Tecido enviado',
    descricao:
      'Quando um cliente avisa que mandou tecido. O saldo só entra depois da conferência na aba Estoque.',
  },
}

export type ConfigNotificacoes = Record<TipoNotificacao, string[]>

export const PADRAO: ConfigNotificacoes = {
  pedido_novo: [],
  pedido_bloqueado_credito: [],
  pedido_cancelado: [],
  cancelamento_solicitado: [],
  tecido_enviado: [],
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Lista de e-mails a partir de texto livre: aceita um por linha, vírgula ou
 * ponto e vírgula. Minúsculas, sem repetição, só o que parece e-mail.
 */
export function listarEmails(texto: string): string[] {
  const vistos = new Set<string>()
  const lista: string[] = []

  for (const parte of texto.split(/[\n,;]+/)) {
    const e = parte.trim().toLowerCase()
    if (!e || !EMAIL.test(e) || vistos.has(e)) continue
    vistos.add(e)
    lista.push(e)
  }

  return lista
}

/** Traz qualquer JSON para o formato certo; o que não for lista vira vazio. */
export function normalizar(bruto: unknown): ConfigNotificacoes {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const saida = { ...PADRAO }

  for (const tipo of TIPOS) {
    const v = o[tipo]
    saida[tipo] = Array.isArray(v) ? listarEmails(v.map(String).join('\n')) : []
  }

  return saida
}
