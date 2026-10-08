'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { desfazerFaturamento } from '@/app/actions/faturamento'

/**
 * Pedido em Estampa pronta que já foi ao Bling pelo fluxo antigo (pedido de
 * venda e/ou cobrança gerados em "Pedido pronto"). Enquanto estiver assim,
 * não entra em agrupamento nem troca de forma. Este bloco desfaz: cancela
 * no Bling, limpa a cobrança no portal e deixa o pedido "pronto" limpo.
 */
export default function DesfazerFaturamento({
  pedidoId,
  blingNumero,
  cobrancaGeradaEm,
}: {
  pedidoId: string
  blingNumero: string | null
  cobrancaGeradaEm: string | null
}) {
  const router = useRouter()
  const [abrindo, setAbrindo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [avisos, setAvisos] = useState<string[] | null>(null)
  const [pendente, iniciar] = useTransition()

  function desfazer() {
    setErro('')
    iniciar(async () => {
      const r = await desfazerFaturamento(pedidoId, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAvisos(r.avisos)
      setAbrindo(false)
      router.refresh()
    })
  }

  if (avisos) {
    return (
      <div className={'rounded-sm px-3 py-2.5 mt-3 border ' + (avisos.length ? 'bg-[#FBF0D9] border-[#C79600]' : 'bg-[#E3F0E8] border-[#2E7D4F]')}>
        <p className={'text-xs ' + (avisos.length ? 'text-[#8A6A00]' : 'text-[#2E7D4F]')}>
          Faturamento desfeito. O pedido voltou a ser um &ldquo;Estampa pronta&rdquo; limpo: pode ser agrupado ou faturado de novo.
        </p>
        {avisos.length > 0 && (
          <ul className="text-[11px] text-[#8A6A00] mt-1 list-disc pl-4">
            {avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="bg-[#FFFBEE] border border-[#C79600] rounded-sm px-3 py-2.5 mt-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#8A6A00]">Já foi ao Bling pelo fluxo antigo</p>
      <p className="text-xs text-[#131A2E] mt-1 leading-relaxed">
        Este pedido tem {blingNumero ? `pedido de venda #${blingNumero}` : 'pedido de venda'}
        {cobrancaGeradaEm ? ` e cobrança gerada em ${new Date(cobrancaGeradaEm).toLocaleDateString('pt-BR')}` : ''} no Bling,
        gerados quando a cobrança saía em &ldquo;Pedido pronto&rdquo;. Por isso ele não entra em agrupamento nem troca de forma.
      </p>
      <p className="text-[11px] text-[#6E6E68] mt-1.5 leading-relaxed">
        Para agrupar ou refaturar, desfaça: o portal apaga as contas a receber e cancela o pedido de venda no Bling,
        limpa a cobrança aqui e registra no andamento. O boleto já emitido no Bling Conta deve ser conferido lá.
        Não dá para desfazer se houver nota emitida ou pagamento registrado.
      </p>

      {!abrindo ? (
        <button onClick={() => setAbrindo(true)} className="mt-2.5 border border-[#131A2E] rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide hover:bg-[#131A2E] hover:text-white">
          DESFAZER FATURAMENTO
        </button>
      ) : (
        <div className="mt-2.5">
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Motivo (mín. 10 caracteres). Ex.: agrupar com os demais pedidos do cliente"
            className="w-full bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
          />
          {erro && <p className="text-xs text-[#B00063] mt-1.5">{erro}</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setAbrindo(false); setErro('') }} disabled={pendente} className="border border-[#131A2E] bg-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-50">
              CANCELAR
            </button>
            <button onClick={desfazer} disabled={pendente || motivo.trim().length < 10} className="bg-[#B00063] text-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-40">
              {pendente ? 'DESFAZENDO…' : 'CONFIRMAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
