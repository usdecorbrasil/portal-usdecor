'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarBling } from '@/lib/bling/cliente'
import { sincronizarPedidoComBling } from '@/lib/bling/pedido'
import { liberarLimiteNoBling, idDoContatoNoBling } from '@/lib/bling/contato'
import { registrar } from '@/lib/auditoria'
import { enviarCobrancaPedido } from '@/lib/cobranca/enviar'

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

  // A cobrança sai junto: se o envio original morreu no meio, o e-mail também
  // não saiu. `email_log` impede duplicar quando ele já foi
  await enviarCobrancaPedido(parsed.data)

  const admin = createAdminClient()
  const { data } = await admin
    .from('pedidos')
    .select('bling_sync_status, bling_erro, bling_numero, bling_pedido_id')
    .eq('id', parsed.data)
    .maybeSingle()

  revalidatePath(`/admin/pedidos/${parsed.data}`)

  if (data?.bling_sync_status === 'enviado') {
    return {
      ok: true,
      detalhe: `Pedido enviado ao Bling${data.bling_numero ? ` (#${data.bling_numero})` : ''}.`,
    }
  }

  return { ok: false, erro: data?.bling_erro ?? 'Não foi possível enviar ao Bling.' }
}

export type LimiteBlingCliente = {
  cliente: string
  situacao: 'tirado' | 'ja_sem_limite' | 'fora_do_bling' | 'erro'
  detalhe: string | null
}

/**
 * Tira o limite de crédito do cadastro de TODOS os clientes no Bling — o
 * limite vale só no portal (decisão do dono, 09/10/2026). Contato já sem
 * limite não é regravado; cada um que muda fica na auditoria do cliente.
 * Uma chamada por vez, com a pausa do limite de 3 requisições por segundo.
 */
export async function tirarLimitesNoBling(): Promise<{ ok: true; resultado: LimiteBlingCliente[] } | { ok: false; erro: string }> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const { data: clientes, error } = await createAdminClient()
    .from('clientes')
    .select('id, razao_social, cnpj, bling_contato_id')
    .order('razao_social')
  if (error) return { ok: false, erro: error.message }

  const pausa = () => new Promise((r) => setTimeout(r, 400))
  const resultado: LimiteBlingCliente[] = []

  for (const c of clientes ?? []) {
    const nome = String(c.razao_social ?? 'cliente')
    const id = await idDoContatoNoBling(c)
    if (!id) {
      resultado.push({ cliente: nome, situacao: 'fora_do_bling', detalhe: null })
      continue
    }
    await pausa()
    const r = await liberarLimiteNoBling(id)
    if (!r.ok) {
      resultado.push({ cliente: nome, situacao: 'erro', detalhe: r.erro })
    } else if (!r.alterado) {
      resultado.push({ cliente: nome, situacao: 'ja_sem_limite', detalhe: null })
    } else {
      const antes = `R$ ${(r.antes ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      resultado.push({ cliente: nome, situacao: 'tirado', detalhe: antes })
      await registrar({
        entidade: 'cliente',
        entidadeId: String(c.id),
        acao: 'editou',
        campos: [{ campo: 'Limite de crédito no Bling', de: antes, para: 'sem limite (o controle é do portal)' }],
        motivo: 'Limite de crédito tirado do Bling para todos os clientes: o limite vale só no portal.',
      })
    }
    await pausa()
  }

  revalidatePath('/admin/clientes')
  return { ok: true, resultado }
}

