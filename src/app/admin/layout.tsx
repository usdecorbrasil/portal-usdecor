import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { lerPerfil } from '@/lib/auth/perfil'
import { logout } from '../actions/auth'
import BuscaHeader from './busca-header'

const LABEL_PAPEL: Record<string, string> = {
  admin: 'ADMIN',
  financeiro: 'FINANCEIRO',
  funcionario: 'PRODUÇÃO',
}

const COR_PAPEL: Record<string, string> = {
  admin: 'bg-[#131A2E] text-white',
  financeiro: 'bg-[#0090D8] text-white',
  funcionario: 'bg-[#E6EDEE] text-[#0090D8]',
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const perfil = await lerPerfil()

  if (!perfil) redirect('/login')
  if (perfil.papel === 'cliente') redirect('/')

  // Admin e financeiro têm o mesmo nível de acesso no painel
  const nivelAdmin = perfil.papel === 'admin' || perfil.papel === 'financeiro'

  const abas = nivelAdmin
    ? [
        { href: '/admin/dashboard', label: 'Dashboard' },
        { href: '/admin/pedidos', label: 'Pedidos' },
        { href: '/admin/fila', label: 'Fila de impressão' },
        { href: '/admin/recebimento', label: 'Financeiro' },
        { href: '/admin/clientes', label: 'Clientes' },
        { href: '/admin/catalogo', label: 'Catálogos' },
        { href: '/admin/configuracoes', label: 'Configurações' },
      ]
    : [
        { href: '/admin/fila', label: 'Fila de impressão' },
        { href: '/admin/pedidos', label: 'Pedidos' },
        { href: '/admin/catalogo', label: 'Catálogos' },
      ]

  return (
    <div className="min-h-screen bg-[#F2F1ED]">
      <header className="bg-white border-b border-[#DDDCD5]">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-4">
          <Image
            src="/logo-horizontal.png"
            alt="Bello Tecido"
            width={483}
            height={120}
            priority
            className="h-8 w-auto shrink-0"
          />

          <BuscaHeader />

          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <span
              className={`text-xs tracking-widest px-2 py-1 rounded-sm ${COR_PAPEL[perfil.papel]}`}
            >
              {LABEL_PAPEL[perfil.papel]}
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