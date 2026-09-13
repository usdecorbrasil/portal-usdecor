'use client'

import { useEffect, useState } from 'react'

/**
 * Modais de mudança de status, compartilhados entre o painel do pedido
 * (`/admin/pedidos/[id]`) e o quadro arrastável da listagem (`/admin/pedidos`).
 * Ficam aqui para que as duas telas peçam exatamente os mesmos dados antes
 * de lançar uma etapa.
 */

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const ROTULOS_STATUS: Record<string, string> = {
  aguardando: 'Aguardando confirmação',
  recebido: 'Pedido confirmado',
  impressao: 'Impressão',
  estampando: 'Estampando',
  corte_costura: 'Em corte / costura',
  pronto: 'Pedido pronto',
  nf_emitida: 'Nota fiscal emitida',
  expedido: 'Expedido',
  entregue: 'Entregue',
  fechado: 'Pedido fechado',
}

export type Item = {
  id: string
  produtoId: string
  sku: string
  nome: string
  pedida: number
  faturada: number
  precoMetro: number
  imagemUrl: string | null
}

/* ---------------- modal do romaneio (ao lançar Estampando) ---------------- */

export function ModalRomaneio({
  numero,
  itens,
  pendente,
  erro,
  onCancelar,
  onConfirmar,
}: {
  numero: number
  itens: Item[]
  pendente: boolean
  erro: string
  onCancelar: () => void
  onConfirmar: (
    metragem: number,
    alteracoes: { id: string; qtd: number }[],
    motivoAjuste: string
  ) => void
}) {
  const [metragem, setMetragem] = useState('')
  const [qtds, setQtds] = useState<Record<string, number>>(
    Object.fromEntries(itens.map((i) => [i.id, i.faturada]))
  )
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [aviso, setAviso] = useState('')

  const alterouQtd = itens.some((i) => (qtds[i.id] ?? 0) !== i.faturada)

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente) onCancelar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [onCancelar, pendente])

  function confirmar() {
    const metragemNum = Number(metragem.replace(',', '.'))

    if (isNaN(metragemNum) || metragemNum <= 0) {
      return setAviso('Informe a metragem total impressa.')
    }

    const alteracoes = itens
      .filter((i) => (qtds[i.id] ?? 0) !== i.faturada)
      .map((i) => ({ id: i.id, qtd: qtds[i.id] ?? 0 }))

    if (alteracoes.length > 0) {
      const zerado = itens.find((i) => (qtds[i.id] ?? 0) <= 0)
      if (zerado) {
        return setAviso(`${zerado.sku}: a quantidade deve ser maior que zero.`)
      }
      if (motivoAjuste.trim().length < 10) {
        return setAviso(
          'Descreva o motivo do ajuste de quantidade com pelo menos 10 caracteres.'
        )
      }
    }

    setAviso('')
    onConfirmar(metragemNum, alteracoes, motivoAjuste.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#131A2E]/70"
        onClick={() => !pendente && onCancelar()}
      />

      <div className="relative bg-white rounded-sm w-full max-w-md my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <h2 className="font-semibold tracking-tight text-lg">
            Gerar romaneio de calandra
          </h2>
          <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
            Pedido #{numero} saindo da Impressão. Informe os dados reais da
            produção — isso recalcula o valor de cobrança e gera o PDF para a
            calandra.
          </p>

          <div className="mt-4">
            <label className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
              QUANTIDADES IMPRESSAS
            </label>
            <div className="space-y-1.5">
              {itens.map((i) => {
                const q = qtds[i.id] ?? 0
                const mudou = q !== i.faturada

                return (
                  <div
                    key={i.id}
                    className="bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="font-mono text-[#6E6E68]">
                          {i.sku}
                        </span>
                        <span className="block truncate">{i.nome}</span>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <div className="flex border border-[#131A2E] rounded-sm overflow-hidden bg-white">
                          <button
                            type="button"
                            aria-label="Diminuir"
                            onClick={() => {
                              setAviso('')
                              setQtds((a) => ({
                                ...a,
                                [i.id]: Math.max(0, (a[i.id] ?? 0) - 1),
                              }))
                            }}
                            className="w-5 text-xs bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={q}
                            onChange={(e) => {
                              setAviso('')
                              const limpo = e.target.value.replace(/^0+(?=\d)/, '')
                              setQtds((a) => ({
                                ...a,
                                [i.id]:
                                  limpo === ''
                                    ? 0
                                    : Math.max(0, parseInt(limpo, 10) || 0),
                              }))
                            }}
                            className="w-9 py-1 text-center text-xs font-mono font-semibold outline-none"
                          />
                          <button
                            type="button"
                            aria-label="Aumentar"
                            onClick={() => {
                              setAviso('')
                              setQtds((a) => ({
                                ...a,
                                [i.id]: (a[i.id] ?? 0) + 1,
                              }))
                            }}
                            className="w-5 text-xs bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                          >
                            +
                          </button>
                        </div>
                        {mudou && (
                          <span className="text-[9px] font-mono text-[#B00063] whitespace-nowrap">
                            pedido: {i.faturada}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {alterouQtd && (
            <div className="mt-3">
              <label
                htmlFor="motivo-ajuste-romaneio"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                MOTIVO DO AJUSTE DE QUANTIDADE
                <span className="text-[#B00063] ml-1">*</span>
              </label>
              <textarea
                id="motivo-ajuste-romaneio"
                rows={2}
                value={motivoAjuste}
                onChange={(e) => {
                  setMotivoAjuste(e.target.value)
                  setAviso('')
                }}
                placeholder="Ex.: 2 unidades saíram com defeito na impressão"
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
              />
            </div>
          )}

          <div className="mt-4">
            <label className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
              METRAGEM TOTAL IMPRESSA<span className="text-[#B00063] ml-1">*</span>
            </label>
            <input
              value={metragem}
              onChange={(e) => {
                setMetragem(e.target.value)
                setAviso('')
              }}
              inputMode="decimal"
              placeholder="Ex.: 128,50"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
            />
          </div>

          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-4 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1">
              ATENÇÃO
            </strong>
            O valor do pedido será recalculado com base nessa metragem. Se o
            pedido for parcelado, as parcelas ainda não pagas serão
            regeneradas.
          </div>

          {(aviso || erro) && (
            <p className="text-sm text-[#B00063] mt-3">{aviso || erro}</p>
          )}

          <div className="grid grid-cols-2 gap-3 mt-5">
            <button
              onClick={onCancelar}
              disabled={pendente}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              onClick={confirmar}
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'GERANDO...' : 'GERAR ROMANEIO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- modal de confirmação de valor (só ao lançar Impressão) ---------------- */

export function ModalConfirmarValor({
  numero,
  itens,
  pendente,
  erro,
  onCancelar,
  onConfirmar,
}: {
  numero: number
  itens: Item[]
  pendente: boolean
  erro: string
  onCancelar: () => void
  onConfirmar: () => void
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente) onCancelar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [onCancelar, pendente])

  const quantidadeTotal = itens.reduce((a, i) => a + i.faturada, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#131A2E]/70"
        onClick={() => !pendente && onCancelar()}
      />

      <div className="relative bg-white rounded-sm w-full max-w-lg my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <h2 className="font-semibold tracking-tight text-lg">
            Revise a quantidade antes de iniciar a impressão
          </h2>
          <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
            Confira item por item antes de avançar.
          </p>

          <div className="mt-4 space-y-1.5">
            {itens.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-2 text-xs bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
              >
                <span className="font-mono text-[#6E6E68] shrink-0">
                  {i.sku}
                </span>
                <span className="flex-1 min-w-0 truncate">{i.nome}</span>
                <span className="font-mono font-semibold shrink-0">
                  {i.faturada} un
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-baseline mt-4 pt-4 border-t-2 border-[#131A2E]">
            <span className="font-semibold tracking-tight text-sm">
              QUANTIDADE TOTAL DO PEDIDO #{numero}
            </span>
            <strong className="font-mono text-xl">{quantidadeTotal} un</strong>
          </div>

          {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

          <div className="grid grid-cols-2 gap-3 mt-5">
            <button
              onClick={onCancelar}
              disabled={pendente}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              onClick={onConfirmar}
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? '...' : 'CONFIRMAR QUANTIDADE E AVANÇAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- modal de confirmação de status (demais etapas) ---------------- */

export function ModalConfirmarStatus({
  de,
  para,
  pendente,
  erro,
  avisoBoleto,
  semNf,
  onCancelar,
  onConfirmar,
}: {
  de: string
  para: string
  pendente: boolean
  erro: string
  avisoBoleto: { total: number; minimo: number } | null
  /** Pedido marcado para sair sem nota — avisa só ao fechar a produção. */
  semNf?: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente) onCancelar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [onCancelar, pendente])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#131A2E]/70"
        onClick={() => !pendente && onCancelar()}
      />

      <div className="relative bg-white rounded-sm w-full max-w-sm p-5">
        <h2 className="font-semibold tracking-tight text-lg">
          Confirmar mudança de status?
        </h2>

        <p className="text-sm text-[#6E6E68] mt-3 leading-relaxed">
          De{' '}
          <strong className="text-[#131A2E]">
            {ROTULOS_STATUS[de] ?? de}
          </strong>{' '}
          para{' '}
          <strong className="text-[#131A2E]">
            {ROTULOS_STATUS[para] ?? para}
          </strong>
          .
        </p>

        {avisoBoleto && (
          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1">
              ATENÇÃO
            </strong>
            Com a metragem impressa, o pedido ficou em{' '}
            <strong>R$ {brl(avisoBoleto.total)}</strong>, abaixo do mínimo de{' '}
            <strong>R$ {brl(avisoBoleto.minimo)}</strong> para boleto. Combine a
            cobrança com o cliente antes de seguir.
          </div>
        )}

        {/* Último momento em que a decisão ainda pode ser desfeita: daqui o
            pedido vai para o Bling e alguém fatura */}
        {semNf && para === 'pronto' && (
          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1">
              SEM NOTA FISCAL
            </strong>
            Este pedido está marcado para sair <strong>sem nota</strong>. Para
            mudar, cancele e ajuste na tela do pedido antes de seguir.
          </div>
        )}

        {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button
            onClick={onCancelar}
            disabled={pendente}
            className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            CANCELAR
          </button>
          <button
            onClick={onConfirmar}
            disabled={pendente}
            className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? '...' : 'CONFIRMAR'}
          </button>
        </div>
      </div>
    </div>
  )
}
