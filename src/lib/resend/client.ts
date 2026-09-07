import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY não configurada em .env.local')
}

export const resend = new Resend(process.env.RESEND_API_KEY)

export const REMETENTE = `Best Color Tecidos <${process.env.RESEND_FROM ?? 'onboarding@resend.dev'}>`