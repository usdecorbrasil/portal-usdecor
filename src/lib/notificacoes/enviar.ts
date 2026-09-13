import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/resend/enviar'
import { normalizar, type TipoNotificacao } from './config'

/**
 * Manda um aviso interno para quem estiver configurado para aquele tipo.
 *
 * Um e-mail só, com todos os destinatários no "para": assim o registro em
 * `email_log` fica um por pedido + tipo, e a trava contra duplicidade
 * continua funcionando. Mandar um por pessoa faria a segunda bater na trava
 * da primeira.
 *
 * Nunca lança. O aviso é conveniência da equipe; a operação que o disparou
 * (criar pedido, pedir cancelamento) já aconteceu e não pode falhar por causa
 * de e-mail.
 */
export async function notificarEquipe(
  tipo: TipoNotificacao,
  params: { assunto: string; html: string; pedidoId?: string }
): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data } = await admin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'notificacoes')
      .maybeSingle()

    let bruto: unknown = {}
    try {
      bruto = data?.valor ? JSON.parse(data.valor) : {}
    } catch {
      bruto = {}
    }

    const para = normalizar(bruto)[tipo]
    if (para.length === 0) return

    await enviarEmail({
      tipo: `interno_${tipo}`,
      destinatario: para,
      assunto: params.assunto,
      html: params.html,
      pedidoId: params.pedidoId,
    })
  } catch (e) {
    console.error('[notificacoes]', tipo, e)
  }
}
