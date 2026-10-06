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

  // Admin, funcionário e financeiro vão para o painel;
  // dentro dele, o layout decide o que cada um vê.
  if (perfil.role === 'admin' || perfil.role === 'funcionario' || perfil.role === 'financeiro') {
    redirect('/admin')
  }

  // Cliente entra pelos pedidos: é o que ele vem acompanhar. O catálogo
  // continua a um toque, na aba ao lado
  redirect('/pedidos')
}