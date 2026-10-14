import { redirect } from 'next/navigation'
import { lerPerfil } from '@/lib/auth/perfil'

/**
 * Porta de entrada do painel.
 * Admin e financeiro caem no Dashboard; funcionário, direto no Estoque.
 */
export default async function AdminHome() {
  const perfil = await lerPerfil()

  if (!perfil) redirect('/')

  if (perfil.papel === 'admin' || perfil.papel === 'financeiro') {
    redirect('/admin/dashboard')
  }

  redirect('/admin/estoque')
}