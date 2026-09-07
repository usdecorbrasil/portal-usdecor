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
        { href: '/admin/financeiro/boletos', label: 'Financeiro' },
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
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Leva à primeira aba do papel: funcionário não acessa o Dashboard */}
          <Link href={abas[0].href} aria-label="Página inicial" className="shrink-0">
            <Image
              src="/logo-horizontal.png"
              alt="Best Color Tecidos"
              width={483}
              height={120}
              priority
              className="h-8 w-auto"
            />
          </Link>

          {/* No celular a busca ganha a própria linha: espremida ao lado do
              logo, o campo e a lista de resultados ficavam ilegíveis */}
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
            <BuscaHeader />
          </div>

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

        <nav className="max-w-5xl mx-auto px-5 flex items-center overflow-x-auto">
          {abas.map((a, i) => (
            <div key={a.href} className="flex items-center shrink-0">
              {i > 0 && (
                <span
                  aria-hidden
                  className="w-px h-4 bg-[#DDDCD5] shrink-0"
                />
              )}
              <Link
                href={a.href}
                className="px-3 py-2.5 text-sm text-[#6E6E68] hover:text-[#131A2E] whitespace-nowrap"
              >
                {a.label}
              </Link>
            </div>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}