import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { logout } from '../actions/auth'
import { CarrinhoProvider } from '@/lib/carrinho/contexto'
import Navegacao from './navegacao'
import BuscaHeaderCliente from './busca-header-cliente'

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, ativo, cliente_id, clientes(razao_social, ativo)')
    .eq('id', user.id)
    .single()

  if (!perfil || !perfil.ativo || perfil.role !== 'cliente') {
    redirect('/')
  }

  const empresa = perfil.clientes as unknown as {
    razao_social: string
    ativo: boolean
  } | null

  if (!empresa?.ativo) redirect('/sem-acesso')

  return (
    <CarrinhoProvider>
      <div className="min-h-screen bg-[#F2F1ED]">
        <header className="bg-white border-b border-[#DDDCD5]">
          <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link href="/catalogo" aria-label="Ir para o catálogo">
                <Image
                  src="/logo-horizontal.png"
                  alt="Best Color Tecidos"
                  width={483}
                  height={120}
                  priority
                  className="h-7 w-auto"
                />
              </Link>
              <p className="text-xs text-[#6E6E68] mt-1 truncate">
                {empresa.razao_social}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <BuscaHeaderCliente />
              <form action={logout}>
                <button
                  type="submit"
                  className="text-xs text-[#6E6E68] hover:text-[#D8007A] whitespace-nowrap"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>

          <Navegacao />
        </header>

        <main className="max-w-3xl mx-auto px-5 py-6">{children}</main>
      </div>
    </CarrinhoProvider>
  )
}