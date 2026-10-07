/**
 * Caixinhas das formas de pagamento permitidas a um cliente. Usado no
 * cadastro e na edição; o nome do campo é `formas_pagamento` (vários valores,
 * lidos com `formData.getAll`). Precisa ficar ao menos uma marcada — o banco
 * recusa lista vazia, e aqui a mensagem já vem antes.
 *
 * Desde 07/10/2026 quem escolhe a forma é a equipe, no Faturar; a lista
 * limita o que pode ser escolhido para este cliente.
 */

export const FORMAS_CLIENTE = [
  'boleto_avista',
  'boleto_parcelado',
  'pix',
  'cartao_credito',
  'cartao_debito',
] as const

export type FormaCliente = (typeof FORMAS_CLIENTE)[number]

export const ROTULOS_FORMA_CLIENTE: Record<FormaCliente, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

export default function FormasPagamentoCliente({
  marcadas,
  prefixoId = 'fp',
}: {
  /** Formas já permitidas; sem informar, todas vêm marcadas (cadastro novo). */
  marcadas?: readonly string[]
  prefixoId?: string
}) {
  const ativas = marcadas ?? FORMAS_CLIENTE

  return (
    <fieldset className="border-t border-[#EFEEE8] pt-4">
      <legend className="sr-only">Formas de pagamento permitidas</legend>
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] mb-1">
        Formas de pagamento permitidas
      </p>
      <p className="text-[11px] text-[#6E6E68] mb-3 leading-relaxed">
        No Faturar, só o que estiver marcado aqui pode ser escolhido para este
        cliente. A configuração geral de Pagamento continua valendo por cima.
      </p>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
        {FORMAS_CLIENTE.map((f) => (
          <label
            key={f}
            htmlFor={`${prefixoId}-${f}`}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input
              id={`${prefixoId}-${f}`}
              type="checkbox"
              name="formas_pagamento"
              value={f}
              defaultChecked={ativas.includes(f)}
              className="accent-[#131A2E]"
            />
            {ROTULOS_FORMA_CLIENTE[f]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
