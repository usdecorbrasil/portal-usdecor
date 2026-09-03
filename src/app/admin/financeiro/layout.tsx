import { redirect } from 'next/navigation'
import { lerPerfil } from '@/lib/auth/perfil'
import Abas from './abas'

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

      <Abas>{children}</Abas>
    </div>
  )
}
