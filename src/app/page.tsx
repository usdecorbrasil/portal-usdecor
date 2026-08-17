import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Descobre o papel do usuário para direcionar
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, ativo')
    .eq('id', user.id)
    .single()

  if (!perfil || !perfil.ativo) {
    // Usuário sem perfil ou desativado: encerra a sessão
    redirect('/sem-acesso')
  }
  
  if (perfil.role === 'admin') {
    redirect('/admin')
  }

  redirect('/catalogo')
}