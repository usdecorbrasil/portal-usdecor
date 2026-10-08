import Link from 'next/link'
import { painelCredito } from '@/app/actions/credito'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Card do Crédito dos clientes, abaixo das abas do Financeiro: resumo do
 * painel (limite concedido, em uso, quem está com boleto vencido, quantas
 * sugestões de ajuste) e o botão para abrir a área completa. Período fixo
 * de 12 meses aqui; dentro da área dá para trocar.
 */
export default async function CardCredito() {
  const painel = await painelCredito(12)
  if (!painel) return null

  const limite = painel.linhas.reduce((s, l) => s + l.limite, 0)
  const emUso = painel.linhas.reduce((s, l) => s + l.emUso, 0)
  const comAtraso = painel.linhas.filter((l) => l.score.vencidosAbertos > 0).length
  const emRisco = painel.linhas.filter(
    (l) => l.score.classe === 'risco' || l.score.classe === 'atencao'
  ).length
  const sugestoes = painel.linhas.filter((l) => l.score.sugestao.acao !== 'manter').length

  return (
    <section className="mt-5 border-2 border-[#131A2E] rounded-sm bg-white">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#DDDCD5]">
        <div className="min-w-0">
          <h2 className="font-bold tracking-tight text-[#131A2E]">Crédito dos clientes</h2>
          <p className="text-xs text-[#6E6E68] mt-0.5">
            Limite, score por cliente, histórico de boletos e sugestão de ajuste.
          </p>
        </div>
        <Link
          href="/admin/financeiro/credito"
          className="shrink-0 bg-[#131A2E] text-white rounded-sm px-4 py-2 text-xs font-semibold tracking-wide"
        >
          ABRIR
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 sm:p-5">
        <Indicador rotulo="Limite concedido" valor={`R$ ${brl(limite)}`} />
        <Indicador
          rotulo="Em boletos hoje"
          valor={`R$ ${brl(emUso)}`}
          detalhe={limite > 0 ? `${Math.round((emUso / limite) * 100)}% do limite` : undefined}
        />
        <Indicador
          rotulo="Com boleto vencido"
          valor={String(comAtraso)}
          detalhe={comAtraso ? 'cliente' + (comAtraso > 1 ? 's' : '') : 'nenhum'}
          alerta={comAtraso > 0}
        />
        <Indicador
          rotulo="Atenção ou risco"
          valor={String(emRisco)}
          detalhe={sugestoes ? `${sugestoes} sugest${sugestoes > 1 ? 'ões' : 'ão'} de ajuste` : 'tudo em ordem'}
          alerta={emRisco > 0}
        />
      </div>
    </section>
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
    <div className={'border rounded-sm px-3 py-2.5 ' + (alerta ? 'border-[#E8A9C7]' : 'border-[#E4E3DC]')}>
      <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">{rotulo}</p>
      <p className={'font-mono text-lg font-semibold mt-0.5 ' + (alerta ? 'text-[#B00063]' : 'text-[#131A2E]')}>{valor}</p>
      {detalhe && <p className="text-[11px] text-[#6E6E68]">{detalhe}</p>}
    </div>
  )
}
