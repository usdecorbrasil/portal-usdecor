'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarTecido, renomearTecido, alternarTecido } from '@/app/actions/estoque'

type Tecido = { id: string; nome: string; ativo: boolean }

/** Cadastro padronizado de tecidos — só o dono. Nunca se apaga: inativa. */
export default function Tecidos({ tecidos }: { tecidos: Tecido[] }) {
  const router = useRouter()
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function depois(r: { ok: true } | { ok: false; erro: string }) {
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    setErro('')
    setNovo('')
    setEditando(null)
    router.refresh()
  }

  return (
    <section className="mt-8">
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
        TECIDOS
        <span className="text-[#9B9A93] normal-case tracking-normal">· cadastro padronizado, só o dono edita</span>
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>

      <div className="bg-white border border-[#DDDCD5] rounded-sm divide-y divide-[#EFEEE8]">
        {tecidos.length === 0 && (
          <p className="px-3 py-3 text-xs text-[#9B9A93]">Nenhum tecido cadastrado.</p>
        )}
        {tecidos.map((t) => (
          <div key={t.id} className="flex items-center gap-2 px-3 py-2">
            {editando === t.id ? (
              <>
                <input
                  value={nomeEdicao}
                  onChange={(e) => setNomeEdicao(e.target.value)}
                  autoFocus
                  className="flex-1 border border-[#DDDCD5] rounded-sm px-2 py-1 text-sm outline-none focus:border-[#131A2E]"
                />
                <button
                  onClick={() => iniciar(async () => depois(await renomearTecido(t.id, nomeEdicao)))}
                  disabled={pendente}
                  className="text-xs font-semibold text-[#131A2E] hover:underline disabled:opacity-50"
                >
                  salvar
                </button>
                <button onClick={() => setEditando(null)} className="text-xs text-[#6E6E68] hover:underline">
                  cancelar
                </button>
              </>
            ) : (
              <>
                <span className={'flex-1 text-sm ' + (t.ativo ? 'font-semibold' : 'text-[#9B9A93] line-through')}>
                  {t.nome}
                </span>
                <button
                  onClick={() => {
                    setEditando(t.id)
                    setNomeEdicao(t.nome)
                  }}
                  className="text-xs text-[#0090D8] hover:underline"
                >
                  renomear
                </button>
                <button
                  onClick={() => iniciar(async () => depois(await alternarTecido(t.id, !t.ativo)))}
                  disabled={pendente}
                  className="text-xs text-[#6E6E68] hover:text-[#B00063] hover:underline disabled:opacity-50"
                >
                  {t.ativo ? 'inativar' : 'reativar'}
                </button>
              </>
            )}
          </div>
        ))}

        <div className="flex items-center gap-2 px-3 py-2 bg-[#FAFAF7]">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Novo tecido (ex.: Oxford, Tactel, Malha PV)"
            maxLength={80}
            className="flex-1 border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm outline-none focus:border-[#131A2E] bg-white"
          />
          <button
            onClick={() => iniciar(async () => depois(await criarTecido(novo)))}
            disabled={pendente || novo.trim().length < 2}
            className="bg-[#131A2E] text-white rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-40"
          >
            ADICIONAR
          </button>
        </div>
      </div>

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
      <p className="text-[11px] text-[#9B9A93] mt-2">
        Tecido com movimentos não pode ser apagado — inative para tirar da lista de lançamento.
      </p>
    </section>
  )
}
