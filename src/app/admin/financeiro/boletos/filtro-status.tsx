'use client'

import Link from 'next/link'
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
  corte_costura: 'Em corte / costura',
  pronto: 'Pedido pronto',
  nf_emitida: 'Nota fiscal emitida',
  expedido: 'Expedido',
  entregue: 'Entregue',
  fechado: 'Pedido fechado',
}

const ORDEM_STATUS = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'corte_costura',
  'pronto', 'nf_emitida', 'expedido', 'entregue', 'fechado',
]

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
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
            <section key={status} data-busca-grupo>
              <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
                {(ROTULOS_STATUS[status] ?? status).toUpperCase()}
                <span className="flex-1 h-px bg-[#DDDCD5]" />
                <span
                  data-busca-contagem
                  className="font-mono normal-case tracking-normal text-[#131A2E]"
                >
                  {itens.length}
                </span>
              </h2>

              <div className="space-y-1.5 sm:space-y-2">
                {itens.map((p) => {
                  const paga = !!p.pagoEm

                  return (
                    <Link
                      key={`${p.pedidoId}-${p.numeroParcela ?? 'unico'}`}
                      href={`/admin/pedidos/${p.pedidoId}`}
                      data-busca={`${p.numero} ${p.clienteNome}`}
                      className={`flex items-center gap-3 rounded-sm p-2.5 sm:p-4 border ${
                        p.vencida
                          ? 'bg-[#FFF6FA] border-[#B00063] hover:border-[#B00063]'
                          : paga
                          ? 'bg-[#FAFAF7] border-[#DDDCD5] opacity-60 hover:opacity-100 hover:border-[#131A2E]'
                          : 'bg-white border-[#DDDCD5] hover:border-[#131A2E]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono text-[10px] sm:text-xs text-[#6E6E68]">
                            #{p.numero}
                            {p.numeroParcela && p.totalParcelas
                              ? ` · ${p.numeroParcela}/${p.totalParcelas}`
                              : ''}
                          </span>
                          <h3 className="font-semibold tracking-tight text-sm sm:text-base truncate">
                            {p.clienteNome}
                          </h3>
                          {p.vencida && (
                            <span className="text-[8px] sm:text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-[#B00063] text-white">
                              vencida
                            </span>
                          )}
                          {paga && (
                            <span className="text-[8px] sm:text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-[#E3F0E8] text-[#2E7D4F]">
                              pago
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5 sm:mt-1">
                          {ROTULOS_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {p.vencimento && (
                          <div
                            className={`font-mono ${
                              p.vencida
                                ? 'text-xs sm:text-sm font-bold text-[#B00063]'
                                : 'text-[10px] sm:text-xs font-semibold text-[#131A2E]'
                            }`}
                          >
                            venc. {dataBr(p.vencimento)}
                          </div>
                        )}
                        <div
                          className={`font-mono font-semibold text-xs sm:text-sm mt-0.5 sm:mt-1 ${
                            p.vencida ? 'text-[#B00063]' : ''
                          }`}
                        >
                          R$ {brl(p.valor)}
                        </div>
                      </div>
                    </Link>
                  )
                })}
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