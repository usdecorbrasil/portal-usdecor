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

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, ativo')
    .eq('id', user.id)
    .single()

  if (!perfil || !perfil.ativo) {
    redirect('/sem-acesso')
  }

  // Só há equipe no portal: admin, financeiro e funcionário vão para o
  // painel, e dentro dele o layout decide o que cada um vê.
  redirect('/admin')
}
