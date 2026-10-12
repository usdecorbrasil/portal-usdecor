import { resumoFluxoCaixa } from '@/app/actions/fluxo-caixa'
import { hojeBrasilia, somarDias } from '@/lib/datas'
import FluxoCaixa from './fluxo-caixa'

/** Card totalizador no topo do Financeiro, já com os próximos 7 dias; os outros períodos vêm pela action. */
export default async function CardFluxo() {
  const hoje = hojeBrasilia()
  const inicial = await resumoFluxoCaixa(hoje, somarDias(hoje, 7))
  if (!inicial) return null
  return <FluxoCaixa inicial={inicial} />
}
