'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarBling } from '@/lib/bling/cliente'
import { sincronizarPedidoComBling } from '@/lib/bling/pedido'

type Resultado =
  | { ok: true; detalhe: string }
  | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return (
    !!perfil && perfil.ativo &&
    (perfil.role === 'admin' || perfil.role === 'financeiro')
  )
}

/**
 * Faz uma chamada real à API para confirmar que o token funciona.
 * Só "estar conectado" no banco não garante nada: o refresh token pode
 * ter sido revogado no painel do Bling sem o portal saber.
 */
export async function testarConexaoBling(): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const r = await chamarBling('/produtos?pagina=1&limite=1')

  if (!r.ok) {
    return {
      ok: false,
      erro: `Falha na chamada (HTTP ${r.status}): ${r.erro.slice(0, 300)}`,
    }
  }

  return {
    ok: true,
    detalhe: `Conexão funcionando (HTTP ${r.status}). O token foi aceito pelo Bling.`,
  }
}

/**
 * Reenvia ao Bling um pedido cuja sincronia falhou.
 *
 * Existe porque o caminho anterior era relançar a etapa de produção só para
 * disparar o envio de novo — mexer no histórico do pedido por causa de uma
 * falha de integração é efeito colateral que ninguém quer.
 */
export async function reenviarPedidoAoBling(
  pedidoId: string
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(pedidoId)
  if (!parsed.success) return { ok: false, erro: 'Pedido inválido.' }

  await sincronizarPedidoComBling(parsed.data)

  const admin = createAdminClient()
  const { data } = await admin
    .from('pedidos')
    .select('bling_sync_status, bling_erro, bling_numero, bling_pedido_id')
    .eq('id', parsed.data)
    .maybeSingle()

  revalidatePath(`/admin/pedidos/${parsed.data}`)

  if (data?.bling_sync_status === 'ok') {
    return {
      ok: true,
      detalhe: `Pedido enviado ao Bling${data.bling_numero ? ` (#${data.bling_numero})` : ''}.`,
    }
  }

  return { ok: false, erro: data?.bling_erro ?? 'Não foi possível enviar ao Bling.' }
}
