'use client'

import { useState, useTransition } from 'react'
import { moverColecao } from '@/app/actions/colecao'

export type Colecao = { id: string; nome: string }

export default function SeletorColecao({
  produtoId,
  colecaoAtual,
  colecoes,
}: {
  produtoId: string
  colecaoAtual: string
  colecoes: Colecao[]
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(colecaoAtual)
  const [escolha, setEscolha] = useState(colecaoAtual)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(false)
  const [pendente, iniciar] = useTransition()

  // Com uma coleção só, não há o que escolher
  if (colecoes.length < 2) return null

  const nomeAtual = colecoes.find((c) => c.id === valor)?.nome ?? '—'

  function salvar() {
    if (escolha === valor) {
      setEditando(false)
      return
    }
    setErro('')

    iniciar(async () => {
      const r = await moverColecao(produtoId, escolha)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setValor(escolha)
      setEditando(false)
      setFeito(true)
      setTimeout(() => setFeito(false), 1800)
    })
  }

  function cancelar() {
    setEscolha(valor)
    setErro('')
    setEditando(false)
  }

  if (!editando) {
    return (
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-mono tracking-[0.14em] text-[#6E6E68]">
            COLEÇÃO
            {feito && <span className="text-[#2E7D4F] ml-1.5">salvo</span>}
          </div>
          <div className="text-xs truncate mt-0.5">{nomeAtual}</div>
        </div>
        <button
          onClick={() => setEditando(true)}
          className="text-[10px] tracking-widest text-[#6E6E68] hover:text-[#B00063] shrink-0"
        >
          ALTERAR
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 border border-[#131A2E] rounded-sm p-2.5">
      <label
        htmlFor={`col-${produtoId}`}
        className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
      >
        MOVER PARA
      </label>
      <select
        id={`col-${produtoId}`}
        value={escolha}
        disabled={pendente}
        onChange={(e) => {
          setEscolha(e.target.value)
          setErro('')
        }}
        className="w-full border border-[#DDDCD5] rounded-sm px-2 py-1.5 bg-white outline-none focus:border-[#131A2E] text-xs disabled:opacity-50"
      >
        {colecoes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>

      {erro && <p className="text-[10px] text-[#B00063] mt-1.5">{erro}</p>}

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={cancelar}
          disabled={pendente}
          className="border border-[#DDDCD5] rounded-sm py-1.5 text-[10px] font-semibold tracking-wider text-[#6E6E68] disabled:opacity-50"
        >
          CANCELAR
        </button>
        <button
          onClick={salvar}
          disabled={pendente}
          className="bg-[#131A2E] text-white rounded-sm py-1.5 text-[10px] font-semibold tracking-wider disabled:opacity-50"
        >
          {pendente ? '...' : 'SALVAR'}
        </button>
      </div>
    </div>
  )
}