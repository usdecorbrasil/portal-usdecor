import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import FormularioCliente from './formulario'
import ListaClientes from './lista-clientes'
import { buscarResumoPagamentos } from '@/app/actions/clientes'

export default async function ClientesPage() {
  const perfil = await lerPerfil()

  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) {
    redirect('/')
  }

  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj, email, preco_metro, limite_credito, ativo')
    .eq('arquivado', false)
    .order('ativo', { ascending: false })
    .order('razao_social')

  const { data: arquivados } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj, email, preco_metro, limite_credito, ativo')
    .eq('arquivado', true)
    .order('razao_social')

  const resumoPagamentos = await buscarResumoPagamentos()

  const semPreco = (clientes ?? []).filter((c) => Number(c.preco_metro) <= 0)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Clientes
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        {clientes?.length ?? 0} cadastrados
      </p>

      {semPreco.length > 0 && (
        <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-4 mb-5">
          <p className="text-sm font-semibold tracking-tight">
            {semPreco.length} cliente{semPreco.length > 1 ? 's' : ''} sem preço
            definido
          </p>
          <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
            {semPreco.map((c) => c.razao_social).join(', ')} — enquanto o preço
            por metro estiver zerado, esses clientes não conseguem enviar pedidos.
          </p>
        </div>
      )}

      <FormularioCliente />

      <ListaClientes
        clientes={(clientes ?? []).map((c) => ({
          ...c,
          preco_metro: Number(c.preco_metro),
          limite_credito: Number(c.limite_credito),
          temAtraso: (resumoPagamentos[c.id]?.vencidosNaoPagos ?? 0) > 0,
        }))}
        arquivados={(arquivados ?? []).map((c) => ({
          ...c,
          preco_metro: Number(c.preco_metro),
          limite_credito: Number(c.limite_credito),
          temAtraso: false,
        }))}
      />
    </div>
  )
}