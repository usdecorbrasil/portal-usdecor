import { createClient } from '@/lib/supabase/server'
import FormularioCliente from './formulario'
import CardCliente from './card-cliente'

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, razao_social, cnpj, email, contato, telefone, ativo')
    .order('ativo', { ascending: false })
    .order('razao_social')

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Clientes
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        {clientes?.length ?? 0} cadastrados
      </p>

      <FormularioCliente />

      <div className="mt-8 space-y-3">
        {clientes?.map((c) => (
          <CardCliente key={c.id} cliente={c} />
        ))}

        {(!clientes || clientes.length === 0) && (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm py-12 text-center">
            <p className="text-sm text-[#6E6E68]">
              Nenhum cliente cadastrado ainda.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}