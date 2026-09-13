import { notFound, redirect } from 'next/navigation'
import BotaoVoltar from '@/components/botao-voltar'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { buscarResumoPagamentos } from '@/app/actions/clientes'
import DetalheCliente from './detalhe-cliente'
import HistoricoAlteracoes from '@/components/historico-alteracoes'

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
      `id, razao_social, cnpj, email, contato, telefone, preco_metro,
       limite_credito, ativo, arquivado,
       inscricao_estadual, indicador_ie, cep, endereco, numero, complemento,
       bairro, municipio, uf, bling_contato_id`
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
      <BotaoVoltar href="/admin/clientes" rotulo="CLIENTES" />

      <DetalheCliente
        cliente={{
          ...cliente,
          preco_metro: Number(cliente.preco_metro),
          limite_credito: Number(cliente.limite_credito),
          em_aberto: emAbertoCliente ? Number(emAbertoCliente.em_aberto) : 0,
        }}
        pagamentos={resumoPagamentos[id] ?? null}
      />

      <HistoricoAlteracoes entidade="cliente" entidadeId={id} recolhido />
    </div>
  )
}