'use client'

import { useActionState, useEffect, useState } from 'react'
import { editarProduto } from '@/app/actions/produtos'
import { reduzirImagem } from '@/lib/imagem/reduzir'

type Colecao = { id: string; nome: string }

type Produto = {
  id: string
  sku: string
  nome: string
  metrosPorUnidade: number
  catalogoId: string
}

export default function EditarProduto({
  produto,
  imagemUrl,
  colecoes,
  aoFechar,
}: {
  produto: Produto
  imagemUrl: string | null
  colecoes: Colecao[]
  aoFechar: () => void
}) {
  const [estado, acao, pendente] = useActionState(editarProduto, null)

  const [preview, setPreview] = useState<string | null>(null)
  const [reduzida, setReduzida] = useState<Blob | null>(null)
  const [info, setInfo] = useState('')
  const [erroImg, setErroImg] = useState('')
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    if (estado?.ok) aoFechar()
  }, [estado, aoFechar])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setErroImg('')
    setProcessando(true)

    const original = Math.round(file.size / 1024)
    const r = await reduzirImagem(file)

    setProcessando(false)

    if (!r.ok) {
      setErroImg(r.erro)
      return
    }

    setReduzida(r.arquivo)
    setPreview(URL.createObjectURL(r.arquivo))
    setInfo(
      original > 1024
        ? `${(original / 1024).toFixed(1)} MB → ${r.kb} KB`
        : `${original} KB → ${r.kb} KB`
    )
  }

  function aoEnviar(dados: FormData) {
    if (reduzida) {
      dados.set('imagem', reduzida, 'arte.webp')
    } else {
      dados.delete('imagem')
    }
    return acao(dados)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-[#131A2E]/70" onClick={aoFechar} />

      <div className="relative bg-white rounded-sm w-full max-w-lg my-8">
        <div className="flex items-center justify-between border-b border-[#DDDCD5] px-5 py-3">
          <h2 className="font-semibold tracking-tight">Editar arte</h2>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form action={aoEnviar} className="p-5 space-y-4">
          <input type="hidden" name="id" value={produto.id} />

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo nome="sku" rotulo="SKU" valor={produto.sku} />
            <Campo nome="nome" rotulo="NOME DO DESENHO" valor={produto.nome} />
          </div>

          <div>
            <label
              htmlFor="ed-colecao"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              COLEÇÃO
            </label>
            <select
              id="ed-colecao"
              name="catalogo_id"
              required
              defaultValue={produto.catalogoId}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
            >
              {colecoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ed-metros"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              METROS POR UNIDADE
            </label>
            <input
              id="ed-metros"
              name="metros_por_unidade"
              required
              inputMode="decimal"
              defaultValue={produto.metrosPorUnidade
                .toFixed(2)
                .replace('.', ',')}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
            />
            <p className="text-xs text-[#6E6E68] mt-1">
              Comprimento de cada repetição da estampa
            </p>
          </div>

          <div>
            <label
              htmlFor="ed-imagem"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              IMAGEM
            </label>

            <div className="flex items-start gap-4">
              {(preview || imagemUrl) && (
                <img
                  src={preview ?? imagemUrl ?? ''}
                  alt=""
                  className="w-20 h-20 object-cover rounded-sm border border-[#DDDCD5] shrink-0"
                />
              )}

              <div className="flex-1 min-w-0">
                <input
                  id="ed-imagem"
                  name="imagem"
                  type="file"
                  accept="image/*"
                  onChange={aoEscolher}
                  className="block w-full text-sm text-[#6E6E68] file:mr-3 file:rounded-sm file:border file:border-[#DDDCD5] file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:tracking-wide"
                />
                {processando && (
                  <p className="text-xs text-[#6E6E68] mt-2">Reduzindo...</p>
                )}
                {info && (
                  <p className="text-xs text-[#2E7D4F] mt-2 font-mono">{info}</p>
                )}
                {erroImg && (
                  <p className="text-xs text-[#B00063] mt-2">{erroImg}</p>
                )}
                <p className="text-xs text-[#6E6E68] mt-2">
                  Só escolha um arquivo se quiser trocar a imagem atual.
                </p>
              </div>
            </div>
          </div>

          {estado && !estado.ok && (
            <p className="text-sm text-[#B00063]">{estado.erro}</p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={pendente || processando}
              className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'SALVANDO...' : 'SALVAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Campo({
  nome,
  rotulo,
  valor,
}: {
  nome: string
  rotulo: string
  valor: string
}) {
  return (
    <div>
      <label
        htmlFor={`ed-${nome}`}
        className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
      >
        {rotulo}
      </label>
      <input
        id={`ed-${nome}`}
        name={nome}
        required
        defaultValue={valor}
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
      />
    </div>
  )
}