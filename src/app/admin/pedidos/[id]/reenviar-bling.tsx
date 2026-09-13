'use client'

import { useState, useTransition } from 'react'
import { reenviarPedidoAoBling } from '@/app/actions/bling'

/**
 * Botão de reenvio ao Bling, mostrado só quando a sincronia falhou.
 * Antes disto, a única forma de tentar de novo era relançar a etapa de
 * produção — mexer no histórico do pedido por causa de falha de integração.
 */
export default function ReenviarBling({
  pedidoId,
  erro,
}: {
  pedidoId: string
  erro: string | null
}) {
  const [resposta, setResposta] = useState<
    { ok: boolean; texto: string } | null
  >(null)
  const [pendente, iniciar] = useTransition()

  function tentar() {
    setResposta(null)
    iniciar(async () => {
      const r = await reenviarPedidoAoBling(pedidoId)
      setResposta(
        r.ok ? { ok: true, texto: r.detalhe } : { ok: false, texto: r.erro }
      )
    })
  }

  // Deu certo: some o bloco vermelho e fica só a confirmação
  if (resposta?.ok) {
    return (
      <div className="bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm px-3 py-2.5 mt-3">
        <p className="text-xs text-[#2E7D4F]">{resposta.texto}</p>
      </div>
    )
  }

  // Sem erro registrado é "pendente": o envio que roda depois de "Pedido
  // pronto" ainda não terminou — ou morreu no meio sem deixar rastro
  const pendenteSemErro = !erro && !resposta

  return (
    <div
      className={
        pendenteSemErro
          ? 'bg-[#FBF0D9] border border-[#C79600] rounded-sm px-3 py-2.5 mt-3'
          : 'bg-[#FFF6FA] border border-[#B00063] rounded-sm px-3 py-2.5 mt-3'
      }
    >
      <p
        className={
          'text-[10px] font-mono uppercase tracking-[0.14em] ' +
          (pendenteSemErro ? 'text-[#8A6A00]' : 'text-[#B00063]')
        }
      >
        {pendenteSemErro ? 'Envio ao Bling pendente' : 'Não foi enviado ao Bling'}
      </p>

      {!pendenteSemErro && (
        <p className="text-xs text-[#131A2E] mt-1 leading-relaxed">
          {resposta?.texto ?? erro}
        </p>
      )}

      <p className="text-[11px] text-[#6E6E68] mt-1.5">
        {pendenteSemErro
          ? 'O envio acontece logo depois de lançar "Pedido pronto". Atualize a página em instantes; se continuar assim, tente de novo.'
          : 'O pedido seguiu normalmente no portal. Corrija o que falta no Bling e tente de novo.'}
      </p>

      <button
        onClick={tentar}
        disabled={pendente}
        className="mt-2.5 bg-[#131A2E] text-white rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'ENVIANDO...' : 'TENTAR DE NOVO'}
      </button>
    </div>
  )
}
