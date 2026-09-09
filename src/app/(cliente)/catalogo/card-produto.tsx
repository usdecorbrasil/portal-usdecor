'use client'

import { useState } from 'react'
import { useCarrinho } from '@/lib/carrinho/contexto'
import Visualizador from '@/components/visualizador-imagem'
import SeletorColecao, { type Colecao } from '@/components/seletor-colecao'

type Produto = {
  id: string
  sku: string
  nome: string
  catalogoId: string
}

export default function CardProduto({
  produto,
  imagemUrl,
  colecoes,
  prioridade = false,
}: {
  produto: Produto
  imagemUrl: string | null
  colecoes: Colecao[]
  prioridade?: boolean
}) {
  const { adicionar, itens } = useCarrinho()
  const noCarrinho = itens.find((i) => i.produtoId === produto.id)
  const [qtd, setQtd] = useState(noCarrinho?.quantidade ?? 0)
  const [feito, setFeito] = useState(false)
  const [ampliada, setAmpliada] = useState(false)

  function ajustar(delta: number) {
    setQtd((v) => Math.max(0, v + delta))
  }

  function adicionarAoCarrinho() {
    if (qtd <= 0) return
    adicionar(
      {
        produtoId: produto.id,
        sku: produto.sku,
        nome: produto.nome,
        imagemUrl,
      },
      qtd
    )
    setFeito(true)
    setTimeout(() => setFeito(false), 1400)
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm overflow-hidden flex flex-col">
      {imagemUrl ? (
        <button
          onClick={() => setAmpliada(true)}
          className="block w-full group"
          aria-label={`Ampliar ${produto.nome}`}
        >
          <img
            src={imagemUrl}
            alt={produto.nome}
            width={280}
            height={112}
            loading={prioridade ? 'eager' : 'lazy'}
            decoding="async"
            className="w-full h-20 sm:h-28 object-cover group-hover:opacity-85 transition-opacity"
          />
        </button>
      ) : (
        <div className="w-full h-20 sm:h-28 bg-[#EEEDE7]" />
      )}

      {ampliada && imagemUrl && (
        <Visualizador
          url={imagemUrl}
          sku={produto.sku}
          nome={produto.nome}
          aoFechar={() => setAmpliada(false)}
        />
      )}

      <div className="p-2 sm:p-3 flex flex-col flex-1">
        <div className="text-[9px] sm:text-[10px] font-mono text-[#131A2E] tracking-wide">
          {produto.sku}
        </div>
        <h3 className="text-xs sm:text-sm font-semibold tracking-tight leading-tight mt-0.5">
          {produto.nome}
        </h3>

        <SeletorColecao
          produtoId={produto.id}
          colecaoAtual={produto.catalogoId}
          colecoes={colecoes}
        />

        <div className="flex border border-[#DDDCD5] rounded-sm overflow-hidden mt-auto pt-1.5 sm:pt-2">
          <button
            onClick={() => ajustar(-5)}
            aria-label="Diminuir"
            className="w-7 h-7 sm:w-8 sm:h-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={5}
            value={qtd}
            onChange={(e) => setQtd(Math.max(0, parseInt(e.target.value) || 0))}
            className="flex-1 w-full text-center font-mono text-xs sm:text-sm outline-none min-w-0"
          />
          <button
            onClick={() => ajustar(5)}
            aria-label="Aumentar"
            className="w-7 h-7 sm:w-8 sm:h-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
          >
            +
          </button>
        </div>

        <button
          onClick={adicionarAoCarrinho}
          disabled={qtd <= 0}
          className={`mt-1.5 sm:mt-2 rounded-sm py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-semibold tracking-wider text-white transition-colors disabled:opacity-40 ${
            feito ? 'bg-[#2E7D4F]' : 'bg-[#131A2E]'
          }`}
        >
          {feito ? 'NO CARRINHO' : noCarrinho ? 'ATUALIZAR' : 'ADICIONAR'}
        </button>
      </div>
    </div>
  )
}