'use client'

import { useState } from 'react'
import BotaoAtivo from './botao-ativo'
import EditarProduto from './editar-produto'
import SeletorColecao, { type Colecao } from '@/components/seletor-colecao'

type Produto = {
  id: string
  sku: string
  nome: string
  metrosPorUnidade: number
  ativo: boolean
  catalogoId: string
}

export default function CardArte({
  produto,
  imagemUrl,
  colecoes,
  podeEditar,
}: {
  produto: Produto
  imagemUrl: string | null
  colecoes: Colecao[]
  podeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)

  const nomeColecao =
    colecoes.find((c) => c.id === produto.catalogoId)?.nome ?? ''

  return (
    <>
      <div
        className={`bg-white border rounded-sm overflow-hidden ${
          produto.ativo ? 'border-[#DDDCD5]' : 'border-[#E8C36B]'
        }`}
      >
        {imagemUrl ? (
          <img
            src={imagemUrl}
            alt={produto.nome}
            loading="lazy"
            decoding="async"
            className={`w-full h-32 object-cover ${produto.ativo ? '' : 'opacity-60'}`}
          />
        ) : (
          <div className="w-full h-32 bg-[#EEEDE7] flex items-center justify-center">
            <span className="text-xs text-[#6E6E68]">sem imagem</span>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-mono text-[#131A2E]">{produto.sku}</div>
              <h3 className="font-semibold tracking-tight mt-1">{produto.nome}</h3>
            </div>
            {podeEditar && (
              <button
                onClick={() => setEditando(true)}
                className="text-xs tracking-widest text-[#6E6E68] hover:text-[#B00063] shrink-0"
              >
                EDITAR
              </button>
            )}
          </div>

          {colecoes.length > 1 && nomeColecao && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-[#6E6E68] border border-[#DDDCD5] rounded-sm px-1.5 py-0.5">
                {nomeColecao}
              </span>
            </div>
          )}

          {!podeEditar && (
            <SeletorColecao
              produtoId={produto.id}
              colecaoAtual={produto.catalogoId}
              colecoes={colecoes}
            />
          )}

          <div className="mt-3 pt-3 border-t border-[#DDDCD5] text-xs text-[#6E6E68] font-mono">
            {produto.metrosPorUnidade.toFixed(2).replace('.', ',')} m por unidade
          </div>

          {podeEditar ? (
            <div className="mt-3">
              <BotaoAtivo
                produtoId={produto.id}
                ativo={produto.ativo}
                sku={produto.sku}
              />
            </div>
          ) : (
            !produto.ativo && (
              <div className="mt-3 text-center text-xs text-[#C79600] bg-[#FBF0D9] rounded-sm py-2">
                Aguardando ativação
              </div>
            )
          )}
        </div>
      </div>

      {editando && (
        <EditarProduto
          produto={produto}
          imagemUrl={imagemUrl}
          colecoes={colecoes}
          aoFechar={() => setEditando(false)}
        />
      )}
    </>
  )
}