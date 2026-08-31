'use client'

import { useEffect, useState, useTransition } from 'react'
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

  useEffect(() => {
    if (!editando) return
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente) cancelar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, pendente])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#131A2E]/70"
        onClick={() => !pendente && cancelar()}
      />

      <div className="relative bg-white rounded-sm w-full max-w-md my-8 max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold tracking-tight text-lg">
            Renomear coleção
          </h3>
          <button
            onClick={cancelar}
            aria-label="Fechar"
            className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <label
          htmlFor={`nome-${catalogoId}`}
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
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
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E]"
        />

        <label
          htmlFor={`desc-${catalogoId}`}
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5 mt-4"
        >
          DESCRIÇÃO
        </label>
        <input
          id={`desc-${catalogoId}`}
          value={descricao}
          maxLength={500}
          placeholder="Opcional"
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E]"
        />

        {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button
            onClick={cancelar}
            disabled={pendente}
            className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            CANCELAR
          </button>
          <button
            onClick={salvar}
            disabled={pendente}
            className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? '...' : 'SALVAR'}
          </button>
        </div>
      </div>
    </div>
  )
}