'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarLimiteCredito } from '@/app/actions/clientes'
import type { Sugestao } from '@/lib/credito/score'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Ajuste do limite a partir da ficha de crédito. A sugestão entra
 * pré-preenchida, mas quem decide o valor e escreve o motivo é o dono: a
 * mudança passa pela mesma RPC do cadastro, com motivo obrigatório e
 * registro em auditoria.
 */
export default function AjustarLimite({
  clienteId,
  cliente,
  limiteAtual,
  emUso,
  sugestao,
}: {
  clienteId: string
  cliente: string
  limiteAtual: number
  emUso: number
  sugestao: Sugestao
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [limite, setLimite] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function abrir(comSugestao: boolean) {
    setErro('')
    setLimite(
      (comSugestao ? sugestao.limiteSugerido : limiteAtual).toFixed(2).replace('.', ',')
    )
    setMotivo(comSugestao ? `Sugestão do painel de crédito: ${sugestao.motivo}` : '')
    setAberto(true)
  }

  function salvar() {
    setErro('')
    const n = Number(limite.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return setErro('Informe um limite válido.')
    if (n === limiteAtual) return setErro('O limite informado é igual ao atual.')
    if (motivo.trim().length < 10) return setErro('Descreva o motivo com pelo menos 10 caracteres.')
    iniciar(async () => {
      const r = await atualizarLimiteCredito(clienteId, n, motivo.trim())
      if (!r.ok) return setErro(r.erro)
      setAberto(false)
      router.refresh()
    })
  }

  const podeAplicar = sugestao.acao !== 'manter' && sugestao.limiteSugerido !== limiteAtual

  return (
    <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
      {!aberto ? (
        <div className="flex flex-wrap gap-2">
          {podeAplicar && (
            <button
              type="button"
              onClick={() => abrir(true)}
              className="bg-[#131A2E] text-white rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide"
            >
              APLICAR SUGESTÃO · R$ {brl(sugestao.limiteSugerido)}
            </button>
          )}
          <button
            type="button"
            onClick={() => abrir(false)}
            className="border border-[#131A2E] rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide"
          >
            AJUSTAR LIMITE
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-[12rem_1fr] gap-3">
          <div>
            <label htmlFor="novo-limite" className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
              NOVO LIMITE
            </label>
            <input
              id="novo-limite"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              inputMode="decimal"
              autoFocus
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm font-mono outline-none focus:border-[#131A2E]"
            />
            <p className="text-[11px] text-[#9B9A93] mt-1">
              {cliente}: hoje R$ {brl(limiteAtual)}, com R$ {brl(emUso)} em boletos.
            </p>
          </div>
          <div>
            <label htmlFor="motivo-limite" className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
              MOTIVO (OBRIGATÓRIO)
            </label>
            <textarea
              id="motivo-limite"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]"
            />
            {erro && <p className="text-xs text-[#B00063] mt-1">{erro}</p>}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={salvar}
                disabled={pendente}
                className="bg-[#B00063] text-white rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50"
              >
                {pendente ? 'SALVANDO…' : 'SALVAR LIMITE'}
              </button>
              <button type="button" onClick={() => setAberto(false)} className="text-xs text-[#6E6E68] hover:text-[#131A2E] px-2">
                cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
