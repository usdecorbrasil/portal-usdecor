'use server'

import { createClient } from '@/lib/supabase/server'
import { chamarBling } from '@/lib/bling/cliente'

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
