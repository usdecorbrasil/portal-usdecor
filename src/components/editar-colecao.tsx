'use client'

import { useState, useTransition } from 'react'
import { renomearColecao } from '@/app/actions/colecao'

export default function EditarColecao({
  catalogoId,
  nomeAtual,
  descricaoAtual,
  compacto = false,
}: {
  catalogoId: string
  nomeAtual: string
  descricaoAtual: string | null
  compacto?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(nomeAtual)
  const [descricao, setDescricao] = useState(descricaoAtual ?? '')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function salvar() {
    if (!nome.trim()) return setErro('O nome não pode ficar vazio.')
    setErro('')

    iniciar(async () => {
      const r = await renomearColecao(catalogoId, nome.trim(), descricao.trim())
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setEditando(false)
    })
  }

  function cancelar() {
    setNome(nomeAtual)
    setDescricao(descricaoAtual ?? '')
    setErro('')
    setEditando(false)
  }

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className={`text-[10px] tracking-widest text-[#6E6E68] hover:text-[#B00063] shrink-0 ${
          compacto ? '' : 'ml-2'
        }`}
      >
        RENOMEAR
      </button>
    )
  }

  return (
    <div className="w-full bg-white border border-[#131A2E] rounded-sm p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold tracking-tight text-sm">Renomear coleção</h3>
        <button
          onClick={cancelar}
          aria-label="Fechar"
          className="text-[#6E6E68] hover:text-[#131A2E] text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <label
        htmlFor={`nome-${catalogoId}`}
        className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
      >
        NOME
      </label>
      <input
        id={`nome-${catalogoId}`}
        value={nome}
        maxLength={120}
        onChange={(e) => {
          setNome(e.target.value)
          setErro('')
        }}
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
      />

      <label
        htmlFor={`desc-${catalogoId}`}
        className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1 mt-3"
      >
        DESCRIÇÃO
      </label>
      <input
        id={`desc-${catalogoId}`}
        value={descricao}
        maxLength={500}
        placeholder="Opcional"
        onChange={(e) => setDescricao(e.target.value)}
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
      />

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={cancelar}
          disabled={pendente}
          className="border border-[#DDDCD5] rounded-sm py-2 text-xs font-semibold tracking-wide text-[#6E6E68] disabled:opacity-50"
        >
          CANCELAR
        </button>
        <button
          onClick={salvar}
          disabled={pendente}
          className="bg-[#131A2E] text-white rounded-sm py-2 text-xs font-semibold tracking-wide disabled:opacity-50"
        >
          {pendente ? '...' : 'SALVAR'}
        </button>
      </div>
    </div>
  )
}