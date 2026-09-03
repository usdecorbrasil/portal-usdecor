import { redirect } from 'next/navigation'
import Link from 'next/link'
import { lerPerfil } from '@/lib/auth/perfil'

const ABAS = [
  { href: '/admin/financeiro/boletos', label: 'Boletos' },
  { href: '/admin/financeiro/custos', label: 'Custos' },
  { href: '/admin/financeiro/apuracao', label: 'Apuração' },
]

export default async function FinanceiroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const perfil = await lerPerfil()

  // Valores monetários: só dono e financeiro
  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) {
    redirect('/')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Financeiro
      </h1>

      <div className="flex gap-2 overflow-x-auto mt-4 mb-6 border-b border-[#DDDCD5]">
        {ABAS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="px-3 py-2.5 text-sm text-[#6E6E68] hover:text-[#131A2E] whitespace-nowrap"
          >
            {a.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
