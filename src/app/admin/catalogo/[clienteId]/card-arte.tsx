'use client'

import { useState } from 'react'
import BotaoAtivo from './botao-ativo'
import EditarProduto from './editar-produto'
import Visualizador from '@/components/visualizador-imagem'
import SeletorColecao, { type Colecao } from '@/components/seletor-colecao'

type Produto = {
  id: string
  sku: string
  nome: string
  largura: number | null
  altura: number | null
  ativo: boolean
  catalogoId: string
}

/** Medidas são só referência — não entram em nenhum cálculo de valor */
export function formatarMedidas(
  largura: number | null,
  altura: number | null
) {
  const fmt = (v: number) => v.toFixed(2).replace('.', ',')
  if (largura != null && altura != null) return `${fmt(largura)} × ${fmt(altura)} m`
  if (largura != null) return `${fmt(largura)} m de largura`
  if (altura != null) return `${fmt(altura)} m de altura`
  return null
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
  const [ampliada, setAmpliada] = useState(false)

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
          <button
            onClick={() => setAmpliada(true)}
            className="block w-full group"
            aria-label={`Ampliar ${produto.nome}`}
          >
            <img
              src={imagemUrl}
              alt={produto.nome}
              loading="lazy"
              decoding="async"
              className={`w-full h-20 sm:h-32 object-cover group-hover:opacity-85 transition-opacity ${
                produto.ativo ? '' : 'opacity-60'
              }`}
            />
          </button>
        ) : (
          <div className="w-full h-20 sm:h-32 bg-[#EEEDE7] flex items-center justify-center">
            <span className="text-[10px] sm:text-xs text-[#6E6E68]">sem imagem</span>
          </div>
        )}

        <div className="p-2.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-mono text-[#131A2E]">{produto.sku}</div>
              <h3 className="font-semibold tracking-tight text-sm sm:text-base mt-0.5 sm:mt-1">{produto.nome}</h3>
            </div>
            {podeEditar && (
              <button
                onClick={() => setEditando(true)}
                className="shrink-0 border border-[#DDDCD5] rounded-sm px-2 py-1 text-[10px] sm:text-xs font-semibold tracking-widest text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063]"
              >
                EDITAR
              </button>
            )}
          </div>

          {colecoes.length > 1 && nomeColecao && (
            <div className="flex flex-wrap gap-1.5 mt-1.5 sm:mt-2">
              <span className="text-[10px] sm:text-xs text-[#6E6E68] border border-[#DDDCD5] rounded-sm px-1.5 py-0.5">
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

          {formatarMedidas(produto.largura, produto.altura) && (
            <div className="mt-2 pt-2 sm:mt-3 sm:pt-3 border-t border-[#DDDCD5] text-[10px] sm:text-xs text-[#6E6E68] font-mono">
              {formatarMedidas(produto.largura, produto.altura)}
            </div>
          )}

          {podeEditar ? (
            <div className="mt-2 sm:mt-3">
              <BotaoAtivo
                produtoId={produto.id}
                ativo={produto.ativo}
                sku={produto.sku}
              />
            </div>
          ) : (
            !produto.ativo && (
              <div className="mt-2 sm:mt-3 text-center text-[10px] sm:text-xs text-[#C79600] bg-[#FBF0D9] rounded-sm py-1.5 sm:py-2">
                Aguardando ativação
              </div>
            )
          )}
        </div>
      </div>

      {ampliada && imagemUrl && (
        <Visualizador
          url={imagemUrl}
          sku={produto.sku}
          nome={produto.nome}
          aoFechar={() => setAmpliada(false)}
        />
      )}

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