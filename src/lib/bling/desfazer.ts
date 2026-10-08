import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarBling } from './cliente'
import { cancelarPedidoNoBling } from './pedido'

const pausa = (ms = 400) => new Promise((r) => setTimeout(r, ms))

/**
 * Desfaz, no Bling, o que o faturamento antigo criou para um pedido:
 * apaga as contas a receber conhecidas (pelo id guardado nas parcelas) e
 * cancela o pedido de venda. Devolve o que não conseguiu, para a equipe
 * terminar no Bling. Nunca lança.
 */
export async function desfazerNoBling(pedidoId: string): Promise<string[]> {
  const admin = createAdminClient()
  const avisos: string[] = []

  const { data: parcelas } = await admin
    .from('pedido_parcelas')
    .select('numero, bling_conta_id')
    .eq('pedido_id', pedidoId)

  for (const p of (parcelas ?? []) as { numero: number; bling_conta_id: number | null }[]) {
    if (!p.bling_conta_id) continue
    const r = await chamarBling(`/contas/receber/${p.bling_conta_id}`, { method: 'DELETE' })
    if (!r.ok && r.status !== 404) {
      avisos.push(`conta a receber da parcela ${p.numero} (id ${p.bling_conta_id}) não foi excluída: ${r.erro.slice(0, 120)}`)
    }
    await pausa()
  }

  const { data: antes } = await admin.from('pedidos').select('bling_pedido_id, bling_erro').eq('id', pedidoId).maybeSingle()
  if (antes?.bling_pedido_id) {
    await cancelarPedidoNoBling(pedidoId)
    const { data: depois } = await admin.from('pedidos').select('bling_erro').eq('id', pedidoId).maybeSingle()
    if (depois?.bling_erro && depois.bling_erro !== antes.bling_erro) {
      avisos.push(`pedido de venda ${antes.bling_pedido_id}: ${depois.bling_erro}`)
    }
  }

  return avisos
}
