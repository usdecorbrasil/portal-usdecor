'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarInstrucoesInternas } from '@/app/actions/producao'

/**
 * Anotações da equipe sobre o pedido. Fica ao lado da observação do cliente,
 * mas com cara diferente de propósito: a do cliente é imutável e o cliente
 * vê; esta é da equipe, editável, e o cliente nunca vê.
 */
export default function InstrucoesInternas({
  pedidoId,
  texto,
}: {
  pedidoId: string
  texto: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(texto ?? '')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function salvar() {
    setErro('')
    iniciar(async () => {
      const r = await salvarInstrucoesInternas(pedidoId, rascunho)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setEditando(false)
      router.refresh()
    })
  }

  function cancelar() {
    setRascunho(texto ?? '')
    setErro('')
    setEditando(false)
  }

  return (
    <>
      <h2 className="text-[10px] tracking-[0.16em] text-[#8A6A00] mt-7 mb-3 flex items-center gap-2">
        INSTRUÇÕES INTERNAS
        <span className="text-[#9B9A93] normal-case tracking-normal">· só a equipe vê</span>
        <span className="flex-1 h-px bg-[#E8D9A8]" />
        {!editando && (
          <button
            onClick={() => setEditando(true)}
            className="normal-case tracking-normal text-[11px] text-[#8A6A00] hover:underline"
          >
            {texto ? 'editar' : 'anotar'}
          </button>
        )}
      </h2>

      {editando ? (
        <div className="bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm p-3">
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            rows={4}
            maxLength={4000}
            autoFocus
            placeholder="Ex.: cliente pediu para conferir a cor do SKU D10409 antes de estampar"
            className="w-full bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#131A2E]"
          />
          {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={cancelar}
              disabled={pendente}
              className="border border-[#131A2E] bg-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              onClick={salvar}
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'SALVANDO…' : 'SALVAR'}
            </button>
          </div>
        </div>
      ) : texto ? (
        <div className="bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm p-4 text-sm leading-relaxed whitespace-pre-line">
          {texto}
        </div>
      ) : (
        <p className="text-xs text-[#9B9A93] border border-dashed border-[#E8D9A8] rounded-sm px-4 py-3">
          Nenhuma anotação da equipe neste pedido.
        </p>
      )}
    </>
  )
}
