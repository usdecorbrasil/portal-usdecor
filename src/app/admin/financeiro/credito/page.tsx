import { painelCredito } from '@/app/actions/credito'
import ListaCredito from './lista-credito'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MESES_OPCOES = [6, 12, 24]

/**
 * Financeiro → Crédito: limite, crédito em uso, score e sugestão por
 * cliente, com a ficha de cada um a um clique. O período (6, 12 ou 24
 * meses) vale para volume, frequência e pontualidade.
 */
export default async function CreditoPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>
}) {
  const { meses: mesesParam } = await searchParams
  const meses = MESES_OPCOES.includes(Number(mesesParam)) ? Number(mesesParam) : 12
  const painel = await painelCredito(meses)
  if (!painel) return null

  const totalLimite = painel.linhas.reduce((s, l) => s + l.limite, 0)
  const totalEmUso = painel.linhas.reduce((s, l) => s + l.emUso, 0)
  const comAtraso = painel.linhas.filter((l) => l.score.vencidosAbertos > 0)
  const sugestoes = painel.linhas.filter((l) => l.score.sugestao.acao !== 'manter')

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-4 leading-relaxed">
        Score por cliente a partir de pontualidade dos boletos, volume faturado e
        frequência de pedidos nos últimos {meses} meses. A sugestão de limite é só
        sugestão: a mudança continua exigindo motivo e fica registrada.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Indicador rotulo="Limite concedido" valor={`R$ ${brl(totalLimite)}`} />
        <Indicador
          rotulo="Em boletos hoje"
          valor={`R$ ${brl(totalEmUso)}`}
          detalhe={totalLimite > 0 ? `${Math.round((totalEmUso / totalLimite) * 100)}% do limite` : undefined}
        />
        <Indicador
          rotulo="Com boleto vencido"
          valor={String(comAtraso.length)}
          detalhe={comAtraso.length ? 'cliente' + (comAtraso.length > 1 ? 's' : '') : 'nenhum'}
          alerta={comAtraso.length > 0}
        />
        <Indicador
          rotulo="Sugestões de ajuste"
          valor={String(sugestoes.length)}
          detalhe={sugestoes.length ? 'aumentar, reduzir ou definir' : 'tudo em ordem'}
        />
      </div>

      <ListaCredito painel={painel} opcoesMeses={MESES_OPCOES} />
    </div>
  )
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  alerta?: boolean
}) {
  return (
    <div className={'border rounded-sm px-3 py-2.5 bg-white ' + (alerta ? 'border-[#E8A9C7]' : 'border-[#E4E3DC]')}>
      <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">{rotulo}</p>
      <p className={'font-mono text-lg font-semibold mt-0.5 ' + (alerta ? 'text-[#B00063]' : 'text-[#131A2E]')}>{valor}</p>
      {detalhe && <p className="text-[11px] text-[#6E6E68]">{detalhe}</p>}
    </div>
  )
}
