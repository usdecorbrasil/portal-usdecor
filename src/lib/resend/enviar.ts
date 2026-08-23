import 'server-only'
import { resend, REMETENTE } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

type ParametrosEmail = {
  tipo: string
  destinatario: string
  assunto: string
  html: string
  pedidoId?: string
  anexos?: { filename: string; content: Buffer }[]
}

type ResultadoEnvio =
  | { ok: true; jaEnviado?: boolean }
  | { ok: false; erro: string }

export async function enviarEmail(params: ParametrosEmail): Promise<ResultadoEnvio> {
  const admin = createAdminClient()

  if (params.pedidoId) {
    const { data: jaEnviado } = await admin.rpc('email_ja_enviado', {
      p_pedido_id: params.pedidoId,
      p_tipo: params.tipo,
    })

    if (jaEnviado) {
      return { ok: true, jaEnviado: true }
    }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: REMETENTE,
      to: params.destinatario,
      subject: params.assunto,
      html: params.html,
      attachments: params.anexos,
    })

    if (error) {
      await admin.rpc('registrar_email_log', {
        p_pedido_id: params.pedidoId ?? null,
        p_tipo: params.tipo,
        p_destinatario: params.destinatario,
        p_provider_id: null,
        p_erro: error.message,
      })
      return { ok: false, erro: error.message }
    }

    await admin.rpc('registrar_email_log', {
      p_pedido_id: params.pedidoId ?? null,
      p_tipo: params.tipo,
      p_destinatario: params.destinatario,
      p_provider_id: data?.id ?? null,
      p_erro: null,
    })

    return { ok: true }
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao enviar e-mail'

    await admin.rpc('registrar_email_log', {
      p_pedido_id: params.pedidoId ?? null,
      p_tipo: params.tipo,
      p_destinatario: params.destinatario,
      p_provider_id: null,
      p_erro: mensagem,
    })

    return { ok: false, erro: mensagem }
  }
}