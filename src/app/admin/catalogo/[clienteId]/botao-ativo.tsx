'use client'

import { useState, useTransition } from 'react'
import { alternarAtivo } from '@/app/actions/produtos'

export default function BotaoAtivo({
  produtoId,
  ativo,
  sku,
}: {
  produtoId: string
  ativo: boolean
  sku: string
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()

  function executar() {
    iniciar(async () => {
      await alternarAtivo(produtoId, !ativo)
      setConfirmando(false)
    })
  }

  // Ativar é seguro: um clique.
  if (!ativo) {
    return (
      <button
        onClick={executar}
        disabled={pendente}
        className="w-full bg-[#2E7D4F] text-white rounded-sm py-2 text-xs font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'ATIVANDO...' : 'ATIVAR'}
      </button>
    )
  }

  // Desativar tira a arte do catálogo do cliente: confirma antes.
  if (confirmando) {
    return (
      <div className="border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-3">
        <p className="text-xs leading-relaxed mb-3">
          <strong>Desativar {sku}?</strong> A arte sai do catálogo do cliente.
          Nada é apagado — pedidos anteriores continuam intactos e você pode
          reativar quando quiser.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setConfirmando(false)}
            className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
          >
            VOLTAR
          </button>
          <button
            onClick={executar}
            disabled={pendente}
            className="bg-[#C79600] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
          >
            {pendente ? '...' : 'DESATIVAR'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="w-full border border-[#DDDCD5] rounded-sm py-2 text-xs font-semibold tracking-wide text-[#6E6E68] hover:border-[#C79600] hover:text-[#C79600]"
    >
      DESATIVAR
    </button>
  )
}