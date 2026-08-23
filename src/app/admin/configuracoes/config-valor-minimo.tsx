'use client'

import { useState, useTransition } from 'react'
import { atualizarValorMinimoBoleto } from '@/app/actions/configuracoes'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ConfigValorMinimoBoleto({
  valorAtual,
}: {
  valorAtual: number
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(valorAtual.toFixed(2).replace('.', ','))
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvar() {
    setErro('')
    setSucesso(false)

    const numero = Number(valor.replace(',', '.'))
    if (isNaN(numero) || numero <= 0) {
      setErro('Informe um valor válido')
      return
    }

    iniciar(async () => {
      const r = await atualizarValorMinimoBoleto(numero)
      if (r.ok) {
        setEditando(false)
        setSucesso(true)
      } else {
        setErro(r.erro)
      }
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight text-sm">
            Valor mínimo por boleto/parcela
          </h3>
          <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
            Bloqueia boleto à vista ou parcelamento que resulte em cobrança
            abaixo desse valor.
          </p>
        </div>
        {!editando && (
          <span className="font-mono font-semibold text-lg whitespace-nowrap">
            R$ {brl(valorAtual)}
          </span>
        )}
      </div>

      {editando ? (
        <div className="mt-3 pt-3 border-t border-[#DDDCD5] space-y-3">
          <div>
            <label className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
              NOVO VALOR
            </label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
            />
          </div>

          {erro && <p className="text-sm text-[#B00063]">{erro}</p>}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setEditando(false)
                setErro('')
                setValor(valorAtual.toFixed(2).replace('.', ','))
              }}
              className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
            >
              CANCELAR
            </button>
            <button
              onClick={salvar}
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
            >
              {pendente ? 'SALVANDO...' : 'SALVAR'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditando(true)}
          className="mt-3 text-xs text-[#0090D8] hover:underline"
        >
          EDITAR
        </button>
      )}

      {sucesso && !editando && (
        <p className="text-xs text-[#2E7D4F] mt-2">Valor atualizado.</p>
      )}
    </div>
  )
}