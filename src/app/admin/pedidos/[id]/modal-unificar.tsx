'use client'

import { useState } from 'react'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type OutroPronto = {
  id: string
  numero: number
  /** Metragem do romaneio; null quando ainda não foi confirmado. */
  metros: number | null
  total: number
}

/**
 * Pop-up do Faturar quando o cliente tem outros pedidos prontos: oferece
 * reunir tudo numa cobrança só antes de ir ao Bling — depois de faturado
 * não dá mais. Pedido sem romaneio aparece travado: o banco recusa agrupar
 * sem metragem confirmada, e avisar aqui evita o erro depois do clique.
 * Nenhuma das saídas grava nada: as duas levam ao resumo de confirmação, e a
 * forma de pagamento escolhida no bloco Faturar vale para o agrupador.
 */
export default function ModalUnificar({
  numeroAtual,
  metrosAtual,
  totalAtual,
  outros,
  resumoPagamento,
  pendente,
  erro,
  onCancelar,
  onFaturarSoEste,
  onUnificar,
}: {
  numeroAtual: number
  metrosAtual: number | null
  totalAtual: number
  outros: OutroPronto[]
  /** Forma de pagamento escolhida no bloco Faturar; vale para o agrupador. */
  resumoPagamento: string
  pendente: boolean
  erro: string
  onCancelar: () => void
  onFaturarSoEste: () => void
  onUnificar: (ids: string[]) => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  const agrupaveis = outros.filter((o) => o.metros != null)
  const escolhidos = outros.filter((o) => marcados.has(o.id))

  const metros = (metrosAtual ?? 0) + escolhidos.reduce((s, o) => s + (o.metros ?? 0), 0)
  const total = totalAtual + escolhidos.reduce((s, o) => s + o.total, 0)

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#131A2E]/70" onClick={pendente ? undefined : onCancelar} />
      <div className="relative bg-white rounded-sm px-6 py-5 w-full max-w-md">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6E68]">
          Faturar pedido #{numeroAtual}
        </h3>
        <p className="mt-2 text-sm leading-relaxed">
          Este cliente tem {outros.length === 1 ? 'outro pedido pronto' : `outros ${outros.length} pedidos prontos`}.
          Quer reunir numa cobrança e nota só? Depois de faturado não dá mais para agrupar.
        </p>

        <ul className="mt-3 border border-[#DDDCD5] rounded-sm divide-y divide-[#DDDCD5]">
          {outros.map((o) => {
            const travado = o.metros == null
            return (
              <li key={o.id}>
                <label
                  className={`flex items-center gap-3 px-3 py-2 text-xs ${
                    travado ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[#F7F6F2]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcados.has(o.id)}
                    disabled={travado || pendente}
                    onChange={() => alternar(o.id)}
                    className="accent-[#B00063]"
                  />
                  <span className="font-mono font-semibold text-[#131A2E] w-14 shrink-0">
                    #{o.numero}
                  </span>
                  <span className="flex-1 text-[#6E6E68]">
                    {travado ? 'sem romaneio — não pode ser agrupado' : `${brl(o.metros ?? 0)} m`}
                  </span>
                  <span className="font-mono text-[#131A2E]">R$ {brl(o.total)}</span>
                </label>
              </li>
            )
          })}
        </ul>

        <p className="mt-3 text-xs text-[#6E6E68]">
          Forma de pagamento: <strong className="text-[#131A2E]">{resumoPagamento}</strong>
          {escolhidos.length > 0 ? ' — vale para a cobrança reunida.' : '.'}
        </p>

        {escolhidos.length > 0 && (
          <dl className="mt-3 text-xs text-[#6E6E68] space-y-1">
            <div className="flex justify-between">
              <dt>Pedidos reunidos</dt>
              <dd className="font-mono text-[#131A2E]">
                #{numeroAtual}, {escolhidos.map((o) => '#' + o.numero).join(', ')}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Metragem</dt>
              <dd className="font-mono text-[#131A2E]">{brl(metros)} m</dd>
            </div>
            <div className="flex justify-between">
              <dt>Total</dt>
              <dd className="font-mono font-bold text-[#131A2E]">R$ {brl(total)}</dd>
            </div>
          </dl>
        )}

        {erro && (
          <p className="mt-3 text-xs text-[#B00063] border border-[#B00063] rounded-sm px-3 py-2">
            {erro}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onFaturarSoEste}
            disabled={pendente}
            className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'AGUARDE…' : 'SÓ ESTE'}
          </button>
          <button
            onClick={() => onUnificar(escolhidos.map((o) => o.id))}
            disabled={pendente || escolhidos.length === 0 || agrupaveis.length === 0}
            className="bg-[#B00063] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-40"
          >
            {pendente ? 'AGUARDE…' : 'UNIFICAR'}
          </button>
        </div>

        <p className="mt-2 text-[11px] text-[#9B9A93] text-center">
          Em seguida você confere o resumo antes de faturar.
        </p>
        <button
          onClick={onCancelar}
          disabled={pendente}
          className="w-full mt-1 text-xs text-[#6E6E68] hover:text-[#131A2E] py-1.5"
        >
          voltar sem faturar
        </button>
      </div>
    </div>
  )
}
