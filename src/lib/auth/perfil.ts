import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Papel = 'admin' | 'funcionario' | 'financeiro'

export type Perfil = {
  id: string
  papel: Papel
  nome: string | null
  /** Admin e financeiro enxergam preços, totais e faturamento */
  veValores: boolean
}

/**
 * Lê o perfil do usuário logado.
 * Use em toda página do painel para decidir o que mostrar.
 *
 * Envolvido em `cache()`: layout e página chamam isto na mesma requisição, e
 * sem o cache cada um fazia a própria ida ao Supabase (getUser + profiles).
 */
export const lerPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null
  // Senha provisória do convite: sem papel até criar a própria senha. O proxy
  // já desvia as telas; isto fecha as server actions, que chegam por POST e
  // não passam pelo desvio.
  if (user.app_metadata?.senha_provisoria === true) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, role, nome, ativo')
    .eq('id', user.id)
    .single()

  if (!data || !data.ativo) return null

  // Portal só da equipe: qualquer outro papel não entra
  if (!['admin', 'funcionario', 'financeiro'].includes(data.role)) return null
  const papel = data.role as Papel

  return {
    id: data.id,
    papel,
    nome: data.nome,
    veValores: papel === 'admin' || papel === 'financeiro',
  }
})
