'use client'

import { useState, useTransition } from 'react'
import { resumoFluxoCaixa, type ResumoFluxo, type Totais } from '@/app/actions/fluxo-caixa'
import { somarDias } from '@/lib/datas'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => iso.split('-').reverse().join('/')

const ATALHOS = [7, 15, 30] as const
type Periodo = (typeof ATALHOS)[number] | 'personalizado'

/**
 * Card totalizador do Financeiro: contas a receber e a pagar que vencem no
 * período (próximos 7, 15 ou 30 dias, ou datas escolhidas), o saldo
 * previsto entre os dois, e o que já venceu, que não espera o período.
 */
export default function FluxoCaixa({ inicial }: { inicial: ResumoFluxo }) {
  const [resumo, setResumo] = useState(inicial)
  const [periodo, setPeriodo] = useState<Periodo>(7)
  const [de, setDe] = useState(inicial.de)
  const [ate, setAte] = useState(inicial.ate)
  const [pendente, iniciar] = useTransition()

  function carregar(novoDe: string, novoAte: string) {
    iniciar(async () => {
      const r = await resumoFluxoCaixa(novoDe, novoAte)
      if (r) setResumo(r)
    })
  }

  function atalho(dias: (typeof ATALHOS)[number]) {
    setPeriodo(dias)
    const novoDe = resumo.hoje
    const novoAte = somarDias(resumo.hoje, dias)
    setDe(novoDe)
    setAte(novoAte)
    carregar(novoDe, novoAte)
  }

  const saldo = Math.round((resumo.aReceber.periodo.valor - resumo.aPagar.periodo.valor) * 100) / 100
  const saldoComVencidas =
    Math.round((saldo + resumo.aReceber.vencidas.valor - resumo.aPagar.vencidas.valor) * 100) / 100

  const botao = (ativo: boolean) =>
    'text-xs px-2.5 py-1.5 rounded-sm border ' +
    (ativo ? 'bg-[#131A2E] text-white border-[#131A2E]' : 'bg-white border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E]')

  return (
    <section className="mt-4 border-2 border-[#131A2E] rounded-sm bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3 border-b border-[#DDDCD5]">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold tracking-tight text-[#131A2E]">Contas a receber e a pagar</h2>
          <p className="text-xs text-[#6E6E68] mt-0.5">
            O que vence de {dataBr(resumo.de)} a {dataBr(resumo.ate)}{pendente ? ' · atualizando…' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          {ATALHOS.map((d) => (
            <button key={d} type="button" onClick={() => atalho(d)} className={botao(periodo === d)}>
              {d} dias
            </button>
          ))}
          <button type="button" onClick={() => setPeriodo('personalizado')} className={botao(periodo === 'personalizado')}>
            personalizado
          </button>
        </div>
      </div>

      {periodo === 'personalizado' && (
        <form
          className="flex flex-wrap items-end gap-2 px-4 sm:px-5 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (de && ate && ate >= de) carregar(de, ate)
          }}
        >
          <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
            DE
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="block border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs bg-white" />
          </label>
          <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
            ATÉ
            <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className="block border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs bg-white" />
          </label>
          <button disabled={pendente || !de || !ate || ate < de} className="text-xs px-3 py-1.5 rounded-sm border border-[#131A2E] bg-white disabled:opacity-50">
            Aplicar
          </button>
        </form>
      )}

      <div className={'grid grid-cols-1 sm:grid-cols-3 gap-2 p-4 sm:p-5 ' + (pendente ? 'opacity-60' : '')}>
        <Bloco
          rotulo="A receber no período"
          t={resumo.aReceber.periodo}
          cor="text-[#2E7D4F]"
          rodape={[
            resumo.aReceber.vencidas.qtd ? { texto: `${linha(resumo.aReceber.vencidas)} já vencida${resumo.aReceber.vencidas.qtd > 1 ? 's' : ''}`, alerta: true } : null,
            resumo.aReceber.semVencimento.qtd ? { texto: `${linha(resumo.aReceber.semVencimento)} ainda sem vencimento (boleto a emitir)` } : null,
          ]}
        />
        <Bloco
          rotulo="A pagar no período"
          t={resumo.aPagar.periodo}
          cor="text-[#B00063]"
          rodape={[resumo.aPagar.vencidas.qtd ? { texto: `${linha(resumo.aPagar.vencidas)} já vencida${resumo.aPagar.vencidas.qtd > 1 ? 's' : ''}`, alerta: true } : null]}
        />
        <div className="border border-[#E4E3DC] rounded-sm px-3 py-2.5">
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">Saldo previsto no período</p>
          <p className={'font-mono text-lg font-semibold mt-0.5 ' + (saldo < 0 ? 'text-[#B00063]' : 'text-[#131A2E]')}>
            {saldo < 0 ? '− ' : ''}R$ {brl(Math.abs(saldo))}
          </p>
          <p className="text-[11px] text-[#6E6E68] mt-1">a receber menos a pagar, só o que vence no período</p>
          {(resumo.aReceber.vencidas.qtd > 0 || resumo.aPagar.vencidas.qtd > 0) && (
            <p className="text-[11px] text-[#6E6E68] mt-1">
              Contando o que já venceu: <span className={'font-mono font-semibold ' + (saldoComVencidas < 0 ? 'text-[#B00063]' : 'text-[#131A2E]')}>{saldoComVencidas < 0 ? '− ' : ''}R$ {brl(Math.abs(saldoComVencidas))}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

const linha = (t: Totais) => `${t.qtd} · R$ ${brl(t.valor)}`

function Bloco({ rotulo, t, cor, rodape }: { rotulo: string; t: Totais; cor: string; rodape: ({ texto: string; alerta?: boolean } | null)[] }) {
  const notas = rodape.filter(Boolean) as { texto: string; alerta?: boolean }[]
  return (
    <div className={'border rounded-sm px-3 py-2.5 ' + (notas.some((n) => n.alerta) ? 'border-[#E8A9C7]' : 'border-[#E4E3DC]')}>
      <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">{rotulo}</p>
      <p className={'font-mono text-lg font-semibold mt-0.5 ' + cor}>R$ {brl(t.valor)}</p>
      <p className="text-[11px] text-[#6E6E68]">{t.qtd} {t.qtd === 1 ? 'conta' : 'contas'}</p>
      {notas.map((n) => (
        <p key={n.texto} className={'text-[11px] mt-1 ' + (n.alerta ? 'text-[#B00063]' : 'text-[#6E6E68]')}>{n.texto}</p>
      ))}
    </div>
  )
}
