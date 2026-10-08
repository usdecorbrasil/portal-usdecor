import Link from 'next/link'
import { listarContasPagar, type FiltroContas } from '@/app/actions/contas-pagar'
import ListaContas from './lista-contas'

/**
 * Contas a pagar. Só nascem das notas e recibos lançados em Estoque →
 * Despesas (decisão do dono em 08/10/2026: não existe conta avulsa). A nota
 * pode ir sem foto/PDF, com confirmação; a conta fica "sem comprovante".
 * A forma de pagamento da nota define se a conta entra já paga ou com
 * vencimentos.
 */

const SITUACOES: { chave: FiltroContas['situacao']; rotulo: string }[] = [
  { chave: 'abertas', rotulo: 'Em aberto' },
  { chave: 'pagas', rotulo: 'Pagas' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
  { chave: 'todas', rotulo: 'Todas' },
]

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataValida = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

export default async function APagarPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; de?: string; ate?: string; comprovante?: string }>
}) {
  const sp = await searchParams
  const situacao = (SITUACOES.find((s) => s.chave === sp.situacao)?.chave ?? 'abertas') as FiltroContas['situacao']
  const filtro: FiltroContas = {
    situacao,
    de: dataValida(sp.de),
    ate: dataValida(sp.ate),
    semComprovante: sp.comprovante === 'pendente',
  }

  const r = await listarContasPagar(filtro)
  if (!r) return null
  const { contas, resumo, hoje } = r

  const quadros = [
    { rotulo: 'VENCIDAS', v: resumo.vencidas, cor: resumo.vencidas.qtd ? 'text-[#B00063]' : 'text-[#131A2E]' },
    { rotulo: 'PRÓXIMOS 7 DIAS', v: resumo.proximos7, cor: 'text-[#131A2E]' },
    { rotulo: 'ATÉ O FIM DO MÊS', v: resumo.restoDoMes, cor: 'text-[#131A2E]' },
    { rotulo: 'PAGO NO MÊS', v: resumo.pagoNoMes, cor: 'text-[#2E7D4F]' },
  ]

  const href = (s: string) => {
    const q = new URLSearchParams({ situacao: s })
    if (filtro.de) q.set('de', filtro.de)
    if (filtro.ate) q.set('ate', filtro.ate)
    if (filtro.semComprovante) q.set('comprovante', 'pendente')
    return `?${q.toString()}`
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-sm text-[#6E6E68] leading-relaxed flex-1">
          Toda conta a pagar nasce de uma nota ou recibo lançado com a forma de pagamento. Nota
          paga na hora (dinheiro, Pix, débito) entra já quitada; lançada sem foto ou PDF, aparece
          como sem comprovante.
        </p>
        <Link
          href="/admin/estoque/despesas/nova"
          className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-[#131A2E] text-white rounded-sm px-3.5 py-2 text-xs font-semibold tracking-wide"
        >
          📷 LANÇAR NOTA DE COMPRA
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {quadros.map((q) => (
          <div key={q.rotulo} className="bg-white border border-[#DDDCD5] rounded-sm px-3 py-2">
            <p className="text-[9px] font-mono tracking-wider text-[#9B9A93]">{q.rotulo}</p>
            <p className={'font-mono font-semibold text-base sm:text-lg ' + q.cor}>R$ {brl(q.v.valor)}</p>
            <p className="text-[11px] text-[#6E6E68]">
              {q.v.qtd} conta{q.v.qtd !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-wrap gap-1">
          {SITUACOES.map((s) => (
            <Link
              key={s.chave}
              href={href(s.chave)}
              className={
                'text-xs px-2.5 py-1.5 rounded-sm border ' +
                (s.chave === situacao
                  ? 'bg-[#131A2E] text-white border-[#131A2E]'
                  : 'bg-white border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E]')
              }
            >
              {s.rotulo}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2" action="">
          <input type="hidden" name="situacao" value={situacao} />
          {filtro.semComprovante && <input type="hidden" name="comprovante" value="pendente" />}
          <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
            {situacao === 'pagas' ? 'PAGAS DE' : 'VENCE DE'}
            <input type="date" name="de" defaultValue={filtro.de} className="block border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs bg-white" />
          </label>
          <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
            ATÉ
            <input type="date" name="ate" defaultValue={filtro.ate} className="block border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs bg-white" />
          </label>
          <button className="text-xs px-3 py-1.5 rounded-sm border border-[#131A2E] bg-white">Filtrar</button>
          {(filtro.de || filtro.ate) && (
            <Link href={`?situacao=${situacao}`} className="text-xs text-[#6E6E68] underline pb-1.5">
              limpar datas
            </Link>
          )}
        </form>
      </div>

      {filtro.semComprovante && (
        <div className="flex flex-wrap items-center gap-2 text-xs bg-[#FBEAF0] border border-[#B00063] text-[#B00063] rounded-sm px-3 py-2 mb-3">
          <span className="flex-1 min-w-0">
            Mostrando só contas de notas sem foto ou PDF. Abra a conta e use &ldquo;anexar comprovante&rdquo;.
          </span>
          <Link href={`?situacao=${situacao}`} className="underline font-semibold">ver todas</Link>
        </div>
      )}

      <ListaContas contas={contas} situacao={situacao} hoje={hoje} />
    </div>
  )
}
