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
       bairro, municipio, uf, bling_contato_id,
       atraso_liberado_em, atraso_liberado_motivo`
    )
    .eq('id', id)
    .single()

  if (!cliente) notFound()

  // Crédito em uso = o que está em boleto (faturado não pago + confirmado
  // ainda não faturado), a mesma conta de `cliente_pode_parcelar`
  const { data: emUso } = await supabase.rpc('credito_em_uso', { p_cliente_id: id })

  const [resumoPagamentos, { data: vencidos }] = await Promise.all([
    buscarResumoPagamentos(),
    supabase.rpc('cliente_boletos_vencidos', { p_cliente_id: id }),
  ])

  return (
    <div>
      <BotaoVoltar href="/admin/clientes" rotulo="CLIENTES" />

      <DetalheCliente
        cliente={{
          ...cliente,
          preco_metro: Number(cliente.preco_metro),
          limite_credito: Number(cliente.limite_credito),
          em_aberto: Number(emUso ?? 0),
          boletos_vencidos: Number(vencidos ?? 0),
          atraso_liberado_em: (cliente.atraso_liberado_em as string | null) ?? null,
          atraso_liberado_motivo: (cliente.atraso_liberado_motivo as string | null) ?? null,
        }}
        pagamentos={resumoPagamentos[id] ?? null}
      />

      <HistoricoAlteracoes entidade="cliente" entidadeId={id} recolhido />
    </div>
  )
}