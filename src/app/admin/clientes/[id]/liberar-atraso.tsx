'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { liberarAtrasoBoleto } from '@/app/actions/clientes'

/**
 * Trava por boleto vencido há mais de 5 dias úteis, vista pela equipe.
 * Mostra quantos boletos travam o cliente e deixa o dono liberar com motivo —
 * a liberação vale até o próximo boleto vencer. Usada na tela do cliente e
 * na do pedido.
 */
export default function LiberarAtraso({
  clienteId,
  vencidos,
  liberadoEm,
  liberadoMotivo,
}: {
  clienteId: string
  vencidos: number
  liberadoEm: string | null
  liberadoMotivo: string | null
}) {
  const router = useRouter()
  const [abrindo, setAbrindo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  if (vencidos === 0 && !liberadoEm) return null

  function liberar() {
    setErro('')
    iniciar(async () => {
      const r = await liberarAtrasoBoleto(clienteId, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAbrindo(false)
      setMotivo('')
      router.refresh()
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#DDDCD5]">
      {vencidos > 0 ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#B00063]">
                {vencidos === 1 ? '1 boleto vencido' : `${vencidos} boletos vencidos`} há mais de 5 dias úteis — pedidos travados
              </p>
              <p className="text-xs text-[#6E6E68] mt-0.5 leading-relaxed">
                O cliente ainda consegue enviar pedido, mas vê o aviso de que
                não será atendido; aqui, nenhum pedido dele muda de etapa. A
                trava cai sozinha quando o pagamento é identificado.
              </p>
            </div>
            {!abrindo && (
              <button
                onClick={() => setAbrindo(true)}
                className="shrink-0 border border-[#131A2E] rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide hover:bg-[#131A2E] hover:text-white"
              >
                LIBERAR
              </button>
            )}
          </div>

          {abrindo && (
            <div className="mt-3 bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm p-3">
              <label
                htmlFor="motivo-liberacao"
                className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
              >
                MOTIVO DA LIBERAÇÃO (OBRIGATÓRIO)
              </label>
              <textarea
                id="motivo-liberacao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Ex.: cliente comprovou pagamento por e-mail, aguardando compensação"
                className="w-full bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
              />
              <p className="text-[11px] text-[#6E6E68] mt-1.5 leading-relaxed">
                Libera os boletos vencidos até agora. O próximo boleto que
                vencer sem pagamento trava de novo. Fica registrado no histórico.
              </p>
              {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    setAbrindo(false)
                    setErro('')
                  }}
                  disabled={pendente}
                  className="border border-[#131A2E] bg-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  onClick={liberar}
                  disabled={pendente || motivo.trim().length < 10}
                  className="bg-[#B00063] text-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-40"
                >
                  {pendente ? 'LIBERANDO…' : 'CONFIRMAR LIBERAÇÃO'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-[#6E6E68] leading-relaxed">
          Trava por atraso liberada em{' '}
          {new Date(liberadoEm!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          {liberadoMotivo && ` — "${liberadoMotivo}"`}. Vale até o próximo boleto vencer.
        </p>
      )}
    </div>
  )
}
