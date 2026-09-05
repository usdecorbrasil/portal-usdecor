'use client'

import Link from 'next/link'
import { useState } from 'react'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Pedido = {
  id: string
  numero: number
  cliente: string
  unidades: number
  total: number
  metragemImpressa: number | null
  temSolicitacao: boolean
  entrada: string
  dias: number
}

export default function SelecaoRomaneio({
  itens,
  dono,
  borda,
  tarja,
}: {
  itens: Pedido[]
  dono: boolean
  borda: string
  tarja: { leve: string; medio: string; forte: string }
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function selecionarTodos() {
    setSelecionados(new Set(itens.map((p) => p.id)))
  }

  function limparSelecao() {
    setSelecionados(new Set())
  }

  function gerarRomaneio() {
    if (selecionados.size === 0) return
    window.open(`/api/romaneio?ids=${Array.from(selecionados).join(',')}`, '_blank')
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-3 py-2">
        <div className="text-xs text-[#6E6E68]">
          {selecionados.size > 0 ? (
            <>
              <strong className="text-[#131A2E]">{selecionados.size}</strong>{' '}
              selecionado{selecionados.size > 1 ? 's' : ''}
            </>
          ) : (
            'Selecione pedidos para gerar o romaneio de calandra'
          )}
        </div>
        <div className="flex items-center gap-3">
          {selecionados.size > 0 ? (
            <button
              type="button"
              onClick={limparSelecao}
              className="text-xs text-[#6E6E68] hover:text-[#131A2E]"
            >
              limpar
            </button>
          ) : (
            <button
              type="button"
              onClick={selecionarTodos}
              className="text-xs text-[#6E6E68] hover:text-[#131A2E]"
            >
              selecionar todos
            </button>
          )}
          <button
            type="button"
            onClick={gerarRomaneio}
            disabled={selecionados.size === 0}
            className="bg-[#131A2E] text-white text-xs font-semibold tracking-wide rounded-sm px-3 py-2 disabled:opacity-40"
          >
            GERAR ROMANEIO DE CALANDRA
          </button>
        </div>
      </div>

      {itens.map((p) => {
        const dias = p.dias
        const nivel: 'leve' | 'medio' | 'forte' =
          dias >= 4 ? 'forte' : dias >= 2 ? 'medio' : 'leve'
        const texto =
          dias >= 2
            ? `Parado há ${dias} dias`
            : dias === 0
            ? 'Movimentado hoje'
            : 'Movimentado ontem'
        const tarjaClasse = tarja[nivel]
        const marcado = selecionados.has(p.id)

        return (
          <div
            key={p.id}
            className={
              'relative bg-white border rounded-sm overflow-hidden ' +
              borda +
              (marcado ? ' ring-2 ring-[#131A2E]' : '')
            }
          >
            <label className="absolute top-2 right-2 z-10 bg-white border border-[#DDDCD5] rounded-sm p-1 leading-none">
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => alternar(p.id)}
                className="w-4 h-4 accent-[#131A2E] block"
              />
            </label>

            <Link href={'/admin/pedidos/' + p.id} className="block">
              <div
                className={
                  tarjaClasse +
                  ' text-[9px] sm:text-[10px] tracking-[0.13em] font-mono px-3 py-1 sm:px-4 sm:py-1.5 flex justify-between gap-2 pr-9'
                }
              >
                <span>{texto.toUpperCase()}</span>
                {p.temSolicitacao && (
                  <span className="normal-case tracking-normal">
                    pediu cancelamento
                  </span>
                )}
              </div>

              <div className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                    <span className="text-xs sm:text-sm font-mono text-[#6E6E68] whitespace-nowrap shrink-0">
                      {p.numero} ·
                    </span>
                    <span className="font-semibold tracking-tight text-base sm:text-lg truncate">
                      {p.cliente}
                    </span>
                  </div>

                  <div className="text-right shrink-0 text-xs sm:text-sm font-mono text-[#6E6E68]">
                    {!dono && (
                      <div className="whitespace-nowrap">
                        {brl(p.metragemImpressa ?? 0)} m
                      </div>
                    )}
                    {dono && (
                      <>
                        <div className="whitespace-nowrap">{p.unidades} un</div>
                        <div className="font-bold text-[#131A2E] whitespace-nowrap">
                          R$ {brl(p.total)}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 mt-2 pt-2 sm:mt-3 sm:pt-3 border-t border-[#DDDCD5] text-[9px] sm:text-[10px] font-mono tracking-[0.11em] text-[#6E6E68]">
                  <span>
                    ENTROU{' '}
                    {new Date(p.entrada).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                  <span className="text-[#B00063] font-semibold">abrir →</span>
                </div>
              </div>
            </Link>
          </div>
        )
      })}
    </>
  )
}
