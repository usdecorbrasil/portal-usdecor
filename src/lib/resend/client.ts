import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY não configurada em .env.local')
}

export const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Remetente dos e-mails. O endereço PRECISA ser de um domínio verificado no
 * Resend — não dá para enviar como @gmail.com, o provedor recusa e o e-mail
 * falharia em SPF/DKIM de qualquer forma.
 */
export const REMETENTE = `Best Color Tecidos <${process.env.RESEND_FROM ?? 'onboarding@resend.dev'}>`

/**
 * Para onde vai a resposta do cliente. É aqui que entra uma caixa comum
 * (Gmail, por exemplo): o envio sai pelo domínio verificado, mas quem
 * responder cai numa caixa que alguém lê de verdade.
 */
export const RESPONDER_PARA = process.env.RESEND_REPLY_TO || undefined