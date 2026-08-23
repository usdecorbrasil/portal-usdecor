import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { buscarResumoPagamentos } from '@/app/actions/clientes'
import DetalheCliente from './detalhe-cliente'

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const perfil = await lerPerfil()

  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) {
    redirect('/')
  }

  const supabase = await createClient()

  const { data: cliente } = await supabase
    .from('clientes')
    .select(
      'id, razao_social, cnpj, email, contato, telefone, preco_metro, limite_credito, ativo, arquivado'
    )
    .eq('id', id)
    .single()

  if (!cliente) notFound()

  const { data: emAberto } = await supabase.rpc('clientes_em_aberto')
  const emAbertoCliente = (emAberto ?? []).find(
    (e: { cliente_id: string; em_aberto: number }) => e.cliente_id === id
  )

  const resumoPagamentos = await buscarResumoPagamentos()

  return (
    <div>
      <Link
        href="/admin/clientes"
        className="text-xs tracking-widest text-[#6E6E68] hover:text-[#131A2E]"
      >
        ← CLIENTES
      </Link>

      <DetalheCliente
        cliente={{
          ...cliente,
          preco_metro: Number(cliente.preco_metro),
          limite_credito: Number(cliente.limite_credito),
          em_aberto: emAbertoCliente ? Number(emAbertoCliente.em_aberto) : 0,
        }}
        pagamentos={resumoPagamentos[id] ?? null}
      />
    </div>
  )
}