'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCarrinho, subtotalItem, precoUnidade } from '@/lib/carrinho/contexto'
import { criarPedido } from '@/app/actions/pedidos'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CarrinhoPage() {
  const {
    itens,
    totalValor,
    totalMetros,
    definir,
    remover,
    limpar,
    notas,
    setNotas,
  } = useCarrinho()

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState<{ numero: number } | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const router = useRouter()

  async function enviar() {
    setErro('')
    setEnviando(true)

    const r = await criarPedido({
      itens: itens.map((i) => ({
        produto_id: i.produtoId,
        quantidade: i.quantidade,
      })),
      notas: notas.trim() || undefined,
    })

    if (!r.ok) {
      setErro(r.erro)
      setEnviando(false)
      return
    }

    limpar()
    setSucesso({ numero: r.numero })
    setEnviando(false)
    router.refresh()
  }

  if (sucesso) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E3F0E8] mb-4">
          <span className="text-2xl text-[#2E7D4F]">✓</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
          Pedido enviado
        </h1>
        <p className="text-sm text-[#6E6E68] mt-2">
          Seu pedido{' '}
          <strong className="font-mono text-[#131A2E]">#{sucesso.numero}</strong>{' '}
          foi registrado.
        </p>
        <Link
          href="/pedidos"
          className="inline-block mt-6 bg-[#131A2E] text-white rounded-sm px-6 py-3 text-sm font-semibold tracking-wide"
        >
          ACOMPANHAR PEDIDO
        </Link>
        <p className="mt-4">
          <Link href="/catalogo" className="text-sm text-[#6E6E68] hover:text-[#131A2E]">
            Voltar ao catálogo
          </Link>
        </p>
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
          Carrinho
        </h1>
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-6">
          <p className="text-sm text-[#6E6E68]">Carrinho vazio.</p>
          <Link
            href="/catalogo"
            className="inline-block mt-4 text-sm text-[#B00063] hover:underline"
          >
            Ir para o catálogo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Carrinho
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        Confira antes de enviar
      </p>

      <div className="space-y-3">
        {itens.map((i) => (
          <div
            key={i.produtoId}
            className="bg-white border border-[#DDDCD5] rounded-sm p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-mono text-[#131A2E]">{i.sku}</div>
                <h2 className="font-semibold tracking-tight mt-0.5">{i.nome}</h2>
                <p className="text-xs text-[#6E6E68] mt-0.5">
                  {i.tecido} · R${' '}
                  {brl(precoUnidade(i.precoMetro, i.metrosPorUnidade))}/un
                </p>
              </div>
              <button
                onClick={() => setRemovendo(i.produtoId)}
                aria-label={`Remover ${i.nome}`}
                className="w-7 h-7 shrink-0 border border-[#DDDCD5] rounded-sm text-[#6E6E68] text-xs hover:border-[#B00063] hover:text-[#B00063]"
              >
                ✕
              </button>
            </div>

            {removendo === i.produtoId ? (
              <div className="mt-3 border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-3">
                <p className="text-xs mb-3">
                  Remover <strong>{i.nome}</strong> do pedido?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRemovendo(null)}
                    className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
                  >
                    VOLTAR
                  </button>
                  <button
                    onClick={() => {
                      remover(i.produtoId)
                      setRemovendo(null)
                    }}
                    className="bg-[#C79600] text-white rounded-sm py-2 text-xs font-semibold"
                  >
                    REMOVER
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[#DDDCD5]">
                <div className="flex border border-[#DDDCD5] rounded-sm overflow-hidden w-32">
                  <button
                    onClick={() => definir(i.produtoId, i.quantidade - 1)}
                    aria-label="Diminuir"
                    className="w-9 h-9 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={i.quantidade}
                    onChange={(e) =>
                      definir(i.produtoId, Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="flex-1 w-full text-center font-mono text-sm outline-none min-w-0"
                  />
                  <button
                    onClick={() => definir(i.produtoId, i.quantidade + 1)}
                    aria-label="Aumentar"
                    className="w-9 h-9 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                  >
                    +
                  </button>
                </div>

                <div className="text-right">
                  <div className="font-mono font-semibold">
                    R$ {brl(subtotalItem(i))}
                  </div>
                  <div className="text-xs text-[#6E6E68] font-mono">
                    {brl(i.quantidade * i.metrosPorUnidade)} m
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <label
          htmlFor="notas"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          NOTAS DO PEDIDO
        </label>
        <textarea
          id="notas"
          rows={3}
          maxLength={2000}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Prazo, forma de dobra, instruções de entrega"
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm resize-y"
        />
      </div>

      <div className="mt-6 border-t-2 border-[#131A2E] pt-4">
        <div className="flex justify-between items-baseline text-sm text-[#6E6E68]">
          <span>Metragem total</span>
          <span className="font-mono">{brl(totalMetros)} m</span>
        </div>
        <div className="flex justify-between items-baseline mt-2">
          <span className="font-semibold tracking-tight">TOTAL DO PEDIDO</span>
          <strong className="font-mono text-2xl">R$ {brl(totalValor)}</strong>
        </div>
      </div>

      {erro && (
        <p className="text-sm text-[#B00063] mt-4 bg-white border border-[#B00063] rounded-sm p-3">
          {erro}
        </p>
      )}

      <button
        onClick={enviar}
        disabled={enviando}
        className="w-full mt-5 mb-4 bg-[#B00063] text-white rounded-sm py-4 text-sm font-bold tracking-wider disabled:opacity-50"
      >
        {enviando ? 'ENVIANDO...' : 'ENVIAR PEDIDO'}
      </button>
    </div>
  )
}