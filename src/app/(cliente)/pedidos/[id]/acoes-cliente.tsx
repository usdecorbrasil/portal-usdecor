'use client'

import { useState, useTransition } from 'react'
import {
  clienteCancelar,
  solicitarCancelamento,
} from '@/app/actions/confirmacao'

export default function AcoesCliente({
  pedidoId,
  numero,
  aguardando,
  temSolicitacao,
  podeSolicitar,
}: {
  pedidoId: string
  numero: number
  aguardando: boolean
  temSolicitacao: boolean
  podeSolicitar: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()

  if (temSolicitacao) {
    return (
      <div className="mt-6 bg-[#F4FAFD] border border-[#0090D8] rounded-sm p-4">
        <p className="font-semibold tracking-tight text-sm">
          Cancelamento solicitado
        </p>
        <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
          Sua solicitação foi enviada à Best Color Tecidos. Você recebe o retorno por
          e-mail e aqui no portal.
        </p>
      </div>
    )
  }

  if (!aguardando && !podeSolicitar) return null

  function seguir() {
    if (motivo.trim().length < 10) {
      return setAviso('Descreva o motivo com pelo menos 10 caracteres.')
    }
    setAviso('')
    if (aguardando) setConfirmando(true)
    else executar()
  }

  function executar() {
    setErro('')
    iniciar(async () => {
      const r = aguardando
        ? await clienteCancelar(pedidoId, motivo.trim())
        : await solicitarCancelamento(pedidoId, motivo.trim())

      if (!r.ok) {
        setErro(r.erro)
        setConfirmando(false)
        return
      }
      setAberto(false)
      setConfirmando(false)
      setMotivo('')
    })
  }

  if (!aberto) {
    return (
      <div className="mt-6">
        <button
          onClick={() => setAberto(true)}
          className="w-full border border-[#DDDCD5] rounded-sm py-3 text-sm text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063]"
        >
          {aguardando ? 'Cancelar pedido' : 'Solicitar cancelamento'}
        </button>
        {!aguardando && (
          <p className="text-xs text-[#6E6E68] text-center mt-2 leading-relaxed">
            Este pedido já foi confirmado. A Best Color Tecidos avalia a solicitação.
          </p>
        )}
      </div>
    )
  }

  if (confirmando) {
    return (
      <div className="mt-6 bg-white border border-[#B00063] rounded-sm p-5">
        <strong className="block text-lg tracking-tight">
          Cancelar o pedido #{numero}?
        </strong>
        <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
          O pedido será cancelado imediatamente e a Best Color Tecidos será avisada.
          Esta ação não pode ser desfeita.
        </p>

        {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={() => setConfirmando(false)}
            className="border border-[#131A2E] rounded-sm py-3 text-sm font-semibold tracking-wide"
          >
            VOLTAR
          </button>
          <button
            onClick={executar}
            disabled={pendente}
            className="bg-[#B00063] text-white rounded-sm py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? '...' : 'SIM, CANCELAR'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 bg-white border border-[#DDDCD5] rounded-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold tracking-tight">
          {aguardando ? 'Cancelar pedido' : 'Solicitar cancelamento'}
        </h2>
        <button
          onClick={() => {
            setAberto(false)
            setAviso('')
            setErro('')
          }}
          aria-label="Fechar"
          className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <label
        htmlFor="motivo-cli"
        className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
      >
        MOTIVO<span className="text-[#B00063] ml-1">*</span>
      </label>
      <textarea
        id="motivo-cli"
        rows={3}
        value={motivo}
        onChange={(e) => {
          setMotivo(e.target.value)
          setAviso('')
        }}
        placeholder="Ex.: mudança na coleção, pedido feito por engano"
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
      />

      {(aviso || erro) && (
        <p className="text-sm text-[#B00063] mt-2">{aviso || erro}</p>
      )}

      <button
        onClick={seguir}
        disabled={pendente}
        className="w-full mt-4 bg-[#B00063] text-white rounded-sm py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente
          ? 'ENVIANDO...'
          : aguardando
          ? 'CONTINUAR'
          : 'ENVIAR SOLICITAÇÃO'}
      </button>
    </div>
  )
}