import { redirect } from 'next/navigation'
import { lerPerfil } from '@/lib/auth/perfil'

/**
 * Porta de entrada do painel.
 * Dono cai no Dashboard; funcionário, direto nos Pedidos.
 */
export default async function AdminHome() {
  const perfil = await lerPerfil()

  if (!perfil || perfil.papel === 'cliente') redirect('/')

  if (perfil.papel === 'admin') redirect('/admin/dashboard')

  redirect('/admin/pedidos')
}