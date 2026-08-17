import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { lerPerfil } from '@/lib/auth/perfil'
import { logout } from '../actions/auth'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const perfil = await lerPerfil()

  if (!perfil) redirect('/login')
  if (perfil.papel === 'cliente') redirect('/')

  const dono = perfil.papel === 'admin'

  const abas = dono
    ? [
        { href: '/admin/dashboard', label: 'Dashboard' },
        { href: '/admin/pedidos', label: 'Pedidos' },
        { href: '/admin/clientes', label: 'Clientes' },
        { href: '/admin/catalogo', label: 'Catálogos' },
        { href: '/admin/arquivados', label: 'Pedidos arquivados' },
      ]
    : [
        { href: '/admin/pedidos', label: 'Pedidos' },
        { href: '/admin/catalogo', label: 'Catálogos' },
      ]

  return (
    <div className="min-h-screen bg-[#F2F1ED]">
      <header className="bg-white border-b border-[#DDDCD5]">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <Image
            src="/logo-horizontal.png"
            alt="Bello Tecido"
            width={483}
            height={120}
            priority
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-3">
            <span
              className={`text-xs tracking-widest px-2 py-1 rounded-sm ${
                dono ? 'bg-[#131A2E] text-white' : 'bg-[#E6EDEE] text-[#0090D8]'
              }`}
            >
              {dono ? 'ADMIN' : 'PRODUÇÃO'}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-xs text-[#6E6E68] hover:text-[#B00063]"
              >
                Sair
              </button>
            </form>
          </div>
        </div>

        <nav className="max-w-5xl mx-auto px-5 flex gap-1 overflow-x-auto">
          {abas.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="px-3 py-2.5 text-sm text-[#6E6E68] hover:text-[#131A2E] whitespace-nowrap"
            >
              {a.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}