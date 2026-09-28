'use client'

// src/app/admin/pedidos/[id]/desagrupar.tsx
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { desagruparPedidos } from '@/app/actions/agrupamento'

export default function Desagrupar({
  pedidoId,
  numero,
  pedidosNumeros,
  bloqueado,
}: {
  pedidoId: string
  numero: number
  /** Números dos pedidos originais que este agrupador reúne. */
  pedidosNumeros: number[]
  /** Cobrança ou NF já gerada: só cancelando no Bling antes. */
  bloqueado: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const lista = pedidosNumeros.map((n) => '#' + n).join(', ')

  function confirmar() {
    if (motivo.trim().length < 10) {
      setErro('Descreva o motivo com pelo menos 10 caracteres.')
      return
    }
    setErro('')
    iniciar(async () => {
      const r = await desagruparPedidos(pedidoId, motivo.trim())
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      router.push('/admin/pedidos')
    })
  }

  return (
    <div className="bg-[#F4F1F7] border border-[#A08FBF] rounded-sm p-4 mt-5">
      <h2 className="font-semibold tracking-tight text-sm text-[#5E4A80]">
        Pedido agrupado
      </h2>
      <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
        Reúne os pedidos {lista}. Cobrança e nota saem por este pedido #{numero}.
      </p>

      {bloqueado ? (
        <p className="text-xs text-[#6E6E68] mt-3 border-l-4 border-[#6E6E68] bg-[#EEEDE7] rounded-r-sm px-3 py-2">
          Já tem cobrança ou nota gerada — para desagrupar, cancele-as no Bling
          e depois cancele este pedido.
        </p>
      ) : !aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-3 w-full text-left bg-white border border-[#DDDCD5] rounded-sm px-4 py-3 hover:border-[#131A2E]"
        >
          <span className="block text-sm font-semibold tracking-tight">Desagrupar</span>
          <span className="block text-[9px] font-mono tracking-[0.09em] uppercase text-[#6E6E68] mt-0.5">
            os pedidos voltam para Pedido pronto e este é cancelado
          </span>
        </button>
      ) : (
        <div className="mt-3">
          <label
            htmlFor="motivo-desagrupar"
            className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
          >
            MOTIVO<span className="text-[#B00063] ml-1">*</span>
          </label>
          <textarea
            id="motivo-desagrupar"
            rows={3}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value)
              setErro('')
            }}
            placeholder="Ex.: cliente pediu cobrança separada por pedido"
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y bg-white"
          />
          <p className="text-xs text-[#6E6E68] mt-1.5">
            Os pedidos {lista} voltam para Pedido pronto. Este pedido #{numero} é
            cancelado com o motivo acima.
          </p>

          {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

          <div className="grid grid-cols-2 gap-3 mt-3">
            <button
              type="button"
              onClick={() => {
                setAberto(false)
                setErro('')
              }}
              disabled={pendente}
              className="border border-[#131A2E] bg-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              VOLTAR
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'DESAGRUPANDO...' : 'DESAGRUPAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}