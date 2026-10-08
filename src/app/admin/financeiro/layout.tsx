import { redirect } from 'next/navigation'
import { lerPerfil } from '@/lib/auth/perfil'
import BuscaPagina from '@/components/busca-pagina'

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
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Financeiro
        </h1>
        <BuscaPagina
          placeholder="Filtrar por nº ou cliente..."
          rotulo="Filtrar o conteúdo desta página"
        />
      </div>

      {children}
    </div>
  )
}
