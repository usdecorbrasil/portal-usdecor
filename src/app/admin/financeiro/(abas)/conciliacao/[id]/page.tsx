import { notFound } from 'next/navigation'
import { carregarExtrato } from '@/app/actions/conciliacao'
import BotaoVoltar from '@/components/botao-voltar'
import Conciliar from './conciliar'

export const maxDuration = 60

export default async function ExtratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const extrato = await carregarExtrato(id)
  if (!extrato) notFound()
  return (
    <div>
      <BotaoVoltar href="/admin/financeiro/conciliacao" rotulo="CONCILIAÇÃO" />
      <Conciliar extrato={extrato} />
    </div>
  )
}
