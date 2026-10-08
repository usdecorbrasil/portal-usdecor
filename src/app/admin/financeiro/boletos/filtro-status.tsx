'use client'

import Link from 'next/link'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME } from '@/components/estilo-lista'
import { useMemo, useState } from 'react'

type Parcela = {
  pedidoId: string
  numero: number
  clienteId: string
  clienteNome: string
  status: string
  formaPagamento: string
  numeroParcela: number | null
  totalParcelas: number | null
  valor: number
  vencimento: string | null
  pagoEm: string | null
  vencida: boolean
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ROTULOS_STATUS: Record<string, string> = {
  aguardando: 'Aguardando confirmação',
  recebido: 'Pedido confirmado',
  impressao: 'Impressão',
  estampando: 'Estampando',
  pronto: 'Estampa pronta',
  faturado: 'Faturado',
  nf_emitida: 'Nota fiscal emitida',
  corte_costura: 'Em corte / costura',
  expedido: 'Expedido',
  entregue: 'Entregue',
  fechado: 'Pedido fechado',
}

const ORDEM_STATUS = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'pronto',
  'faturado', 'nf_emitida', 'expedido', 'entregue', 'corte_costura', 'fechado',
]

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

function dataBr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function FiltroStatus({ parcelas }: { parcelas: Parcela[] }) {
  const [filtro, setFiltro] = useState<string | null>(null)

  const grupos = useMemo(() => {
    const m = new Map<string, Parcela[]>()
    parcelas.forEach((p) => {
      const lista = m.get(p.status) ?? []
      lista.push(p)
      m.set(p.status, lista)
    })
    return m
  }, [parcelas])

  const statusDisponiveis = ORDEM_STATUS.filter((s) => grupos.has(s))
  const statusVisiveis = filtro ? [filtro] : statusDisponiveis

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <BotaoFiltro
          ativo={filtro === null}
          onClick={() => setFiltro(null)}
          rotulo="Todos"
          contagem={parcelas.length}
        />
        {statusDisponiveis.map((s) => (
          <BotaoFiltro
            key={s}
            ativo={filtro === s}
            onClick={() => setFiltro(s)}
            rotulo={ROTULOS_STATUS[s] ?? s}
            contagem={grupos.get(s)?.length ?? 0}
          />
        ))}
      </div>

      <div className="space-y-8">
        {statusVisiveis.map((status) => {
          const itens = (grupos.get(status) ?? []).slice().sort((a, b) => {
            if (!a.vencimento) return 1
            if (!b.vencimento) return -1
            return a.vencimento.localeCompare(b.vencimento)
          })

          if (itens.length === 0) return null

          return (
            <section key={status} data-busca-grupo className="space-y-0">
              <h2 className="flex items-center gap-2 px-2.5 py-1 border border-b-0 border-[#E4E3DC] bg-[#FCFCFA] rounded-t-sm text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6E68]">
                {ROTULOS_STATUS[status] ?? status}
                <span
                  data-busca-contagem
                  className="font-mono font-semibold text-[11px] opacity-60"
                >
                  {itens.length}
                </span>
              </h2>

              <div className={CAIXA + ' rounded-t-none'}>
                <div className={CABECALHO}>
                  <span className="w-1 shrink-0" aria-hidden />
                  <span className="w-16 shrink-0">Nº</span>
                  <span className="flex-1 min-w-0">Cliente</span>
                  <span className="w-28 shrink-0 hidden sm:block">Forma</span>
                  <span className="w-16 shrink-0 text-right">Venc.</span>
                  <span className="w-20 shrink-0 text-right">Valor</span>
                </div>

                <div className={CORPO}>
                  {itens.map((p) => {
                    const paga = !!p.pagoEm

                    return (
                      <Link
                        key={`${p.pedidoId}-${p.numeroParcela ?? 'unico'}`}
                        href={`/admin/pedidos/${p.pedidoId}`}
                        data-busca={`${p.numero} ${p.clienteNome}`}
                        className={
                          'flex items-stretch hover:bg-[#FAFAF8] ' +
                          (paga ? 'bg-[#FAFAF7] opacity-60 hover:opacity-100' : 'bg-white')
                        }
                      >
                        <span
                          aria-hidden
                          className={
                            'w-1 shrink-0 ' +
                            (p.vencida
                              ? 'bg-[#B00063]'
                              : paga
                              ? 'bg-[#8CB399]'
                              : 'bg-transparent')
                          }
                        />

                        <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5">
                          <span className={NUM + ' w-16 shrink-0 text-[#6E6E68]'}>
                            {p.numero}
                            {p.numeroParcela && p.totalParcelas
                              ? ` ${p.numeroParcela}/${p.totalParcelas}`
                              : ''}
                          </span>

                          <span className={NOME + ' flex-1 min-w-0'}>
                            {p.clienteNome}
                          </span>

                          {p.vencida && (
                            <span className={ETIQUETA + ' bg-[#B00063] text-white'}>
                              vencida
                            </span>
                          )}
                          {paga && (
                            <span className={ETIQUETA + ' bg-[#E3F0E8] text-[#2E7D4F]'}>
                              pago
                            </span>
                          )}

                          <span className="w-28 shrink-0 text-[10px] text-[#9B9A93] truncate hidden sm:block">
                            {ROTULOS_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}
                          </span>

                          <span
                            className={
                              NUM +
                              ' w-16 shrink-0 text-right ' +
                              (p.vencida ? 'font-bold text-[#B00063]' : 'text-[#6E6E68]')
                            }
                          >
                            {p.vencimento ? dataBr(p.vencimento) : '—'}
                          </span>

                          <span
                            className={
                              NUM +
                              ' w-20 shrink-0 text-right font-semibold ' +
                              (p.vencida ? 'text-[#B00063]' : 'text-[#131A2E]')
                            }
                          >
                            {brl(p.valor)}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function BotaoFiltro({
  ativo,
  onClick,
  rotulo,
  contagem,
}: {
  ativo: boolean
  onClick: () => void
  rotulo: string
  contagem: number
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold tracking-wide px-3 py-2 rounded-sm border ${
        ativo
          ? 'bg-[#131A2E] text-white border-[#131A2E]'
          : 'bg-white text-[#6E6E68] border-[#DDDCD5] hover:border-[#131A2E]'
      }`}
    >
      {rotulo}
      <span
        className={`ml-1.5 font-mono ${ativo ? 'text-white/70' : 'text-[#6E6E68]'}`}
      >
        {contagem}
      </span>
    </button>
  )
}