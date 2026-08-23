import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type Papel = 'admin' | 'funcionario' | 'cliente' | 'financeiro'

export type Perfil = {
  id: string
  papel: Papel
  clienteId: string | null
  nome: string | null
  /** Admin e financeiro enxergam preços, totais e faturamento */
  veValores: boolean
}

/**
 * Lê o perfil do usuário logado.
 * Use em toda página do painel para decidir o que mostrar.
 */
export async function lerPerfil(): Promise<Perfil | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, role, cliente_id, nome, ativo')
    .eq('id', user.id)
    .single()

  if (!data || !data.ativo) return null

  const papel = data.role as Papel

  return {
    id: data.id,
    papel,
    clienteId: data.cliente_id,
    nome: data.nome,
    veValores: papel === 'admin' || papel === 'financeiro',
  }
}