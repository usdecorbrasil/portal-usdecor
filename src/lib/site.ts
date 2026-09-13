import 'server-only'

/**
 * Endereço público do portal, usado para montar os links dentro dos e-mails.
 *
 * Só é lido no servidor, então **não leva o prefixo `NEXT_PUBLIC_`** — esse
 * prefixo embute o valor no pacote que vai para o navegador, o que aqui não
 * serve para nada e ainda faz a Vercel avisar que o valor está exposto.
 *
 * `NEXT_PUBLIC_SITE_URL` continua sendo lida como ponte enquanto a variável
 * antiga não for removida da Vercel; assim a renomeação pode acontecer antes
 * ou depois do deploy, em qualquer ordem, sem janela de link quebrado.
 */
export function urlDoSite(): string {
  const url = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL

  // Sem isto, quatro dos cinco usos montavam "undefined/login" no e-mail
  if (!url) return 'http://localhost:3000'

  return url.replace(/\/+$/, '')
}
