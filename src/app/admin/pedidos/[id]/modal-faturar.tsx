'use client'

import { useEffect } from 'react'
import { ROTULOS_FATURA, type AvaliacaoFatura } from '@/lib/pagamento/faturar'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dataBr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')

/**
 * Confirmação do Faturar — mesmo padrão dos modais de status. O botão
 * Faturar não fatura direto: aqui quem fatura confere cliente, pedidos
 * reunidos, metragem, mercadoria, forma, parcelas, acréscimo, total e nota
 * fiscal. Bloqueio (mínimo, forma não permitida, limite de crédito sem
 * liberação) aparece em vermelho e desativa o confirmar.
 */
export default function ModalFaturar({
  cliente,
  numeros,
  metragem,
  emitirNf,
  avaliacao,
  motivoLiberacao,
  pendente,
  erro,
  onVoltar,
  onConfirmar,
}: {
  cliente: string
  /** Pedido individual (um número) ou os reunidos no agrupador. */
  numeros: number[]
  metragem: number | null
  emitirNf: boolean
  avaliacao: AvaliacaoFatura
  /** Preenchido quando o dono liberou o limite de crédito neste Faturar. */
  motivoLiberacao: string
  pendente: boolean
  erro: string
  onVoltar: () => void
  onConfirmar: () => void
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente) onVoltar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [onVoltar, pendente])

  const liberado = motivoLiberacao.trim().length >= 10
  const creditoTrava = !!avaliacao.credito && !liberado
  const bloqueado = avaliacao.bloqueios.length > 0 || creditoTrava
  const rotuloForma =
    ROTULOS_FATURA[avaliacao.forma as keyof typeof ROTULOS_FATURA] ?? avaliacao.forma
  const parcelado = avaliacao.parcelas > 1
  const agrupado = numeros.length > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#131A2E]/70"
        onClick={() => !pendente && onVoltar()}
      />

      <div className="relative bg-white rounded-sm w-full max-w-md my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <h2 className="font-semibold tracking-tight text-lg">
            Confirmar faturamento
          </h2>
          <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
            {agrupado
              ? 'Os pedidos abaixo viram um agrupador, que vai ao Bling com uma cobrança e uma nota só.'
              : 'Pedido de venda no Bling, cobrança e nota fiscal (quando é com nota), com e-mails ao cliente.'}
          </p>

          <dl className="mt-4 text-xs text-[#6E6E68] space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt>Cliente</dt>
              <dd className="text-[#131A2E] text-right">{cliente}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{agrupado ? 'Pedidos reunidos' : 'Pedido'}</dt>
              <dd className="font-mono text-[#131A2E] text-right">
                {numeros.map((n) => '#' + n).join(', ')}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Metragem impressa</dt>
              <dd className="font-mono text-[#131A2E]">
                {metragem !== null ? `${brl(metragem)} m` : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Mercadoria</dt>
              <dd className="font-mono text-[#131A2E]">R$ {brl(avaliacao.mercadoria)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Forma de pagamento</dt>
              <dd className="text-[#131A2E] text-right">
                {rotuloForma}
                {parcelado ? ` · ${avaliacao.parcelas}x` : ''}
              </dd>
            </div>
            {avaliacao.taxa > 0 && (
              <div className="flex justify-between gap-3">
                <dt>Acréscimo da forma</dt>
                <dd className="font-mono text-[#131A2E]">+ R$ {brl(avaliacao.taxa)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 pt-1.5 border-t border-[#DDDCD5]">
              <dt className="font-semibold text-[#131A2E]">Total cobrado</dt>
              <dd className="font-mono font-bold text-[#131A2E] text-base">
                R$ {brl(avaliacao.totalCobrado)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Nota fiscal</dt>
              <dd className={emitirNf ? 'text-[#131A2E]' : 'text-[#8A6A00] font-semibold'}>
                {emitirNf ? 'emite' : 'sem nota fiscal'}
              </dd>
            </div>
          </dl>

          {avaliacao.forma && (
            <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
              <p className="text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1.5">
                {parcelado ? 'PARCELAS' : 'COBRANÇA'}
              </p>
              <div className="space-y-1">
                {avaliacao.parcelasPrevistas.map((pc) => (
                  <div
                    key={pc.numero}
                    className="flex items-center justify-between gap-2 text-xs bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
                  >
                    <span className="font-mono text-[#6E6E68]">
                      {pc.numero}/{avaliacao.parcelasPrevistas.length}
                    </span>
                    <span className="font-mono text-[#131A2E]">R$ {brl(pc.valor)}</span>
                    <span className="text-[#6E6E68]">
                      {pc.vencimento
                        ? `venc. ${dataBr(pc.vencimento)}`
                        : avaliacao.forma === 'boleto_avista'
                        ? 'vence em 4 dias úteis'
                        : avaliacao.forma === 'cartao_credito' || avaliacao.forma === 'cartao_debito'
                        ? 'pelo link de pagamento'
                        : 'à vista'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {avaliacao.bloqueios.map((b) => (
            <div
              key={b}
              className="bg-[#FFF6FA] border-l-4 border-[#B00063] rounded-r-sm p-3 mt-3 text-xs leading-relaxed text-[#B00063]"
            >
              <strong className="block text-[10px] tracking-widest mb-1">NÃO DÁ PARA FATURAR ASSIM</strong>
              {b}
            </div>
          ))}

          {avaliacao.credito && creditoTrava && (
            <div className="bg-[#FFF6FA] border-l-4 border-[#B00063] rounded-r-sm p-3 mt-3 text-xs leading-relaxed text-[#B00063]">
              <strong className="block text-[10px] tracking-widest mb-1">LIMITE DE CRÉDITO</strong>
              {avaliacao.credito} Volte e libere com motivo, ou escolha outra forma.
            </div>
          )}

          {avaliacao.credito && liberado && (
            <div className="bg-[#FFFBEE] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
              <strong className="block text-[10px] tracking-widest mb-1 text-[#8A6A00]">
                LIMITE DE CRÉDITO LIBERADO
              </strong>
              {avaliacao.credito} Será liberado com o motivo:{' '}
              <em>&ldquo;{motivoLiberacao.trim()}&rdquo;</em>. Fica registrado em Alterações no pedido.
            </div>
          )}

          {!emitirNf && (
            <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
              <strong className="block text-[10px] tracking-widest mb-1">SEM NOTA FISCAL</strong>
              Este pedido está marcado para sair <strong>sem nota</strong>. Para mudar,
              volte e ajuste em &ldquo;Nota fiscal&rdquo; antes de faturar.
            </div>
          )}

          {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

          <div className="grid grid-cols-2 gap-3 mt-5">
            <button
              onClick={onVoltar}
              disabled={pendente}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              VOLTAR
            </button>
            <button
              onClick={onConfirmar}
              disabled={pendente || bloqueado}
              className="bg-[#B00063] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-40"
            >
              {pendente ? 'FATURANDO...' : 'CONFIRMAR E FATURAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
