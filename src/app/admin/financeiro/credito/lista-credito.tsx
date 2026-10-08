'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PainelCredito, LinhaCredito } from '@/app/actions/credito'
import { COR_CLASSE, ROTULO_ACAO, ROTULO_CLASSE } from '@/lib/credito/score'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'
import { baixarCsv, numCsv, paraCsv } from '@/components/baixar-csv'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Ordem = 'score' | 'uso' | 'faturamento' | 'nome'

const COR_ACAO: Record<string, string> = {
  aumentar: 'text-[#2E7D4F]',
  definir: 'text-[#0090D8]',
  reduzir: 'text-[#B00063]',
  manter: 'text-[#9B9A93]',
}

export default function ListaCredito({
  painel,
  opcoesMeses,
}: {
  painel: PainelCredito
  opcoesMeses: number[]
}) {
  const router = useRouter()
  const [ordem, setOrdem] = useState<Ordem>('score')
  const [soAjustes, setSoAjustes] = useState(false)

  const linhas = useMemo(() => {
    const base = soAjustes
      ? painel.linhas.filter((l) => l.score.sugestao.acao !== 'manter')
      : painel.linhas
    return [...base].sort((a, b) => {
      if (ordem === 'nome') return a.cliente.localeCompare(b.cliente)
      if (ordem === 'faturamento') return b.faturamento - a.faturamento
      if (ordem === 'uso') return usoDe(b) - usoDe(a)
      return b.score.score - a.score.score
    })
  }, [painel.linhas, ordem, soAjustes])

  function exportar() {
    baixarCsv(
      `credito-clientes-${painel.de}_a_${painel.ate}.csv`,
      paraCsv([
        ['Cliente', 'Situação', 'Score', 'Classe', 'Limite', 'Em boletos', 'Uso %', 'Faturamento período', 'Pedidos', 'Boletos avaliados', 'Pagos em dia', 'Pagos com atraso', 'Vencidos abertos', 'Sugestão', 'Limite sugerido', 'Motivo'],
        ...linhas.map((l) => [
          l.cliente,
          l.ativo ? 'ativo' : 'inativo',
          l.score.score,
          ROTULO_CLASSE[l.score.classe],
          numCsv(l.limite),
          numCsv(l.emUso),
          Math.round(usoDe(l) * 100),
          numCsv(l.faturamento),
          l.pedidos,
          l.score.boletosAvaliados,
          l.score.pagosEmDia,
          l.score.pagosComAtraso,
          l.score.vencidosAbertos,
          ROTULO_ACAO[l.score.sugestao.acao],
          numCsv(l.score.sugestao.limiteSugerido),
          l.score.sugestao.motivo,
        ]),
      ])
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1">
          {opcoesMeses.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => router.push(`/admin/financeiro/credito?meses=${m}`)}
              className={`border rounded-sm px-2.5 py-1 text-xs ${
                m === painel.meses ? 'border-[#131A2E] bg-[#131A2E] text-white' : 'border-[#DDDCD5] text-[#6E6E68]'
              }`}
            >
              {m} meses
            </button>
          ))}
        </div>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          aria-label="Ordenar por"
          className="border border-[#DDDCD5] rounded-sm px-2.5 py-1 bg-white text-xs outline-none focus:border-[#131A2E]"
        >
          <option value="score">Maior score</option>
          <option value="uso">Maior uso do limite</option>
          <option value="faturamento">Maior faturamento</option>
          <option value="nome">Nome</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[#6E6E68]">
          <input type="checkbox" checked={soAjustes} onChange={(e) => setSoAjustes(e.target.checked)} />
          só com sugestão de ajuste
        </label>
        <button
          type="button"
          onClick={exportar}
          className="ml-auto border border-[#131A2E] rounded-sm px-3 py-1 text-xs font-semibold tracking-wide"
        >
          EXPORTAR CSV
        </button>
      </div>

      {linhas.length === 0 ? (
        <div className={VAZIO} data-busca-vazio>Nenhum cliente nesta seleção.</div>
      ) : (
        <div className={CAIXA} data-busca-grupo>
          <div className={CABECALHO}>
            <span className="w-10 shrink-0 text-right">Score</span>
            <span className="flex-1 min-w-0">Cliente</span>
            <span className="w-24 shrink-0 text-right hidden sm:inline">Limite</span>
            <span className="w-28 shrink-0 text-right hidden sm:inline">Uso</span>
            <span className="w-24 shrink-0 text-right hidden md:inline">Faturado</span>
            <span className="w-28 sm:w-36 shrink-0 text-right hidden sm:inline">Sugestão</span>
          </div>
          <div className={CORPO}>
            {linhas.map((l) => {
              const uso = usoDe(l)
              const s = l.score
              return (
                <Link
                  key={l.clienteId}
                  href={`/admin/financeiro/credito/${l.clienteId}?meses=${painel.meses}`}
                  data-busca={l.cliente}
                  // No celular a linha quebra em duas: nome em cima, uso e
                  // sugestão embaixo (`sm:contents` desfaz o agrupamento no desktop)
                  className="relative flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 pl-4 pr-2.5 py-2 sm:py-1.5 bg-white hover:bg-[#FAFAF8]"
                >
                  <span
                    aria-hidden
                    className={'absolute left-2 top-0 bottom-0 w-1 ' + (s.vencidosAbertos > 0 ? 'bg-[#B00063]' : s.classe === 'excelente' ? 'bg-[#8CB399]' : s.classe === 'bom' ? 'bg-[#92A0C0]' : s.classe === 'atencao' ? 'bg-[#C4A868]' : 'bg-[#DDDCD5]')}
                  />
                  <span className={NUM + ' w-10 shrink-0 text-right text-sm font-bold'}>{s.score}</span>
                  <span className="flex-1 min-w-0">
                    <span className={NOME + ' block'}>{l.cliente}</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      <span className={ETIQUETA + ' ' + COR_CLASSE[s.classe]}>{ROTULO_CLASSE[s.classe]}</span>
                      {s.vencidosAbertos > 0 && (
                        <span className={ETIQUETA + ' bg-[#FBEAF0] text-[#B00063]'}>
                          {s.vencidosAbertos} vencido{s.vencidosAbertos > 1 ? 's' : ''}
                        </span>
                      )}
                      {!l.ativo && <span className={ETIQUETA + ' bg-[#EEEDE7] text-[#6E6E68]'}>inativo</span>}
                    </span>
                  </span>
                  <span className="flex w-full sm:w-auto sm:contents items-center gap-2 pl-12 sm:pl-0">
                  <span className={NUM + ' w-24 shrink-0 text-right hidden sm:inline'}>
                    {l.limite > 0 ? `R$ ${brl(l.limite)}` : '—'}
                  </span>
                  <span className="flex-1 sm:flex-none sm:w-28 shrink-0 text-left sm:text-right">
                    <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] sm:hidden">
                      Uso{l.limite > 0 ? ` · limite R$ ${brl(l.limite)}` : ''}
                    </span>
                    <span className={NUM + ' block'}>R$ {brl(l.emUso)}</span>
                    <span className="block h-1 bg-[#EEEDE7] rounded-full mt-1 overflow-hidden">
                      <span
                        className={'block h-full ' + (uso >= 1 ? 'bg-[#B00063]' : uso >= 0.8 ? 'bg-[#C79600]' : 'bg-[#131A2E]')}
                        style={{ width: `${Math.min(100, Math.round(uso * 100))}%` }}
                      />
                    </span>
                  </span>
                  <span className={NUM + ' w-24 shrink-0 text-right hidden md:inline text-[#6E6E68]'}>
                    R$ {brl(l.faturamento)}
                  </span>
                  <span className={'w-28 sm:w-36 shrink-0 text-right ' + COR_ACAO[s.sugestao.acao]}>
                    <span className="block text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] sm:hidden">
                      Sugestão
                    </span>
                    <span className="block text-xs font-semibold">{ROTULO_ACAO[s.sugestao.acao]}</span>
                    {s.sugestao.acao !== 'manter' && (
                      <span className={NUM + ' block'}>R$ {brl(s.sugestao.limiteSugerido)}</span>
                    )}
                  </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-[#9B9A93] mt-3 leading-relaxed">
        Score = pontualidade (−50 a +50: pago em dia soma, pago com atraso ou vencido desconta)
        + volume (até 30) + frequência (até 20), menos 10 por boleto vencido em aberto.
        Excelente ≥ 80 · Bom ≥ 60 · Atenção ≥ 40 · Risco abaixo disso.
      </p>
    </div>
  )
}

function usoDe(l: LinhaCredito) {
  return l.limite > 0 ? l.emUso / l.limite : 0
}
