'use client'

import { useActionState, useEffect, useState } from 'react'
import { criarCatalogo } from '@/app/actions/catalogos'

type Cliente = { id: string; razao_social: string }

export default function NovoCatalogo({ clientes }: { clientes: Cliente[] }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(criarCatalogo, null)

  useEffect(() => {
    if (estado?.ok) setAberto(false)
  }, [estado])

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        disabled={clientes.length === 0}
        className="w-full sm:w-auto bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-40"
      >
        + CADASTRAR NOVO CATÁLOGO
      </button>
    )
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold tracking-tight">Novo catálogo</h2>
        <button
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <form action={acao} className="space-y-4">
        <div>
          <label
            htmlFor="nc-cliente"
            className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
          >
            CLIENTE<span className="text-[#B00063] ml-1">*</span>
          </label>
          <select
            id="nc-cliente"
            name="cliente_id"
            required
            defaultValue=""
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
          >
            <option value="" disabled>
              Selecione o cliente
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="nc-nome"
            className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
          >
            NOME DO CATÁLOGO<span className="text-[#B00063] ml-1">*</span>
          </label>
          <input
            id="nc-nome"
            name="nome"
            required
            placeholder="Coleção Verão 2026"
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="nc-desc"
            className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
          >
            DESCRIÇÃO
          </label>
          <input
            id="nc-desc"
            name="descricao"
            placeholder="Opcional"
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
          />
        </div>

        {estado && !estado.ok && (
          <p className="text-sm text-[#B00063]">{estado.erro}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pendente}
            className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'CRIANDO...' : 'CRIAR CATÁLOGO'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="border border-[#DDDCD5] rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide text-[#6E6E68]"
          >
            CANCELAR
          </button>
        </div>
      </form>
    </div>
  )
}