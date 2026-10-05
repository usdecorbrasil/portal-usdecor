'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function iso(d: Date) {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function inicioDoMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function fimDoMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

/**
 * Se o período é um mês de calendário inteiro (do dia 1 ao último dia, ou
 * do dia 1 até hoje no mês corrente), devolve o primeiro dia dele. É o que
 * permite as setas "mês anterior / mês seguinte" andarem de mês em mês.
 */
function mesInteiro(de: string, ate: string): Date | null {
  const d = new Date(de + 'T00:00:00')
  if (d.getDate() !== 1) return null
  const a = new Date(ate + 'T00:00:00')
  const hoje = new Date()
  const ehMesCorrente =
    d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth()
  const fim = ehMesCorrente ? hoje : fimDoMes(d)
  return iso(a) === iso(fim) ? d : null
}

export default function FiltroPeriodo({ de, ate }: { de: string; ate: string }) {
  const router = useRouter()
  const [deLocal, setDeLocal] = useState(de)
  const [ateLocal, setAteLocal] = useState(ate)
  const [aberto, setAberto] = useState(false)

  const hoje = new Date()
  const mes = mesInteiro(de, ate)
  // Não deixa andar para um mês que ainda não começou
  const podeAvancar =
    !!mes &&
    (mes.getFullYear() < hoje.getFullYear() ||
      (mes.getFullYear() === hoje.getFullYear() && mes.getMonth() < hoje.getMonth()))

  function aplicar(novoDe: string, novoAte: string) {
    if (!novoDe || !novoAte) return
    const p = new URLSearchParams({ de: novoDe, ate: novoAte })
    router.push(`/admin/dashboard?${p.toString()}`)
  }

  function irParaMes(d: Date) {
    const ehCorrente =
      d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth()
    aplicar(iso(inicioDoMes(d)), iso(ehCorrente ? hoje : fimDoMes(d)))
  }

  const atalhos = [
    { label: 'Este mês', acao: () => irParaMes(hoje) },
    {
      label: 'Mês passado',
      acao: () => irParaMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
    },
    {
      label: 'Últimos 3 meses',
      acao: () =>
        aplicar(iso(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)), iso(hoje)),
    },
    {
      label: 'Este ano',
      acao: () => aplicar(iso(new Date(hoje.getFullYear(), 0, 1)), iso(hoje)),
    },
  ]

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Setas de mês: só quando o período é um mês inteiro */}
        {mes && (
          <div className="inline-flex border border-[#DDDCD5] rounded-sm bg-white">
            <button
              type="button"
              onClick={() => irParaMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
              aria-label="Mês anterior"
              className="px-2.5 py-1.5 text-sm text-[#6E6E68] hover:text-[#131A2E]"
            >
              ‹
            </button>
            <span className="px-2 py-1.5 text-xs sm:text-sm font-semibold tracking-tight text-[#131A2E] capitalize">
              {MESES[mes.getMonth()]} de {mes.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => irParaMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
              disabled={!podeAvancar}
              aria-label="Mês seguinte"
              className="px-2.5 py-1.5 text-sm text-[#6E6E68] hover:text-[#131A2E] disabled:opacity-30 disabled:hover:text-[#6E6E68]"
            >
              ›
            </button>
          </div>
        )}

        {atalhos.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.acao}
            className="border border-[#DDDCD5] rounded-full px-3 py-1.5 text-xs text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            {a.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className={`border rounded-full px-3 py-1.5 text-xs ${
            aberto || !mes
              ? 'border-[#131A2E] text-[#131A2E]'
              : 'border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]'
          }`}
        >
          Datas específicas {aberto ? '▴' : '▾'}
        </button>
      </div>

      {(aberto || !mes) && (
        <div className="flex items-end gap-2 flex-wrap mt-3">
          <div>
            <label className="block text-[9px] tracking-widest text-[#6E6E68] mb-1">
              DE
            </label>
            <input
              type="date"
              value={deLocal}
              max={ateLocal}
              onChange={(e) => setDeLocal(e.target.value)}
              className="border border-[#DDDCD5] rounded-sm px-2.5 py-2 bg-white text-xs sm:text-sm outline-none focus:border-[#131A2E]"
            />
          </div>

          <div>
            <label className="block text-[9px] tracking-widest text-[#6E6E68] mb-1">
              ATÉ
            </label>
            <input
              type="date"
              value={ateLocal}
              min={deLocal}
              onChange={(e) => setAteLocal(e.target.value)}
              className="border border-[#DDDCD5] rounded-sm px-2.5 py-2 bg-white text-xs sm:text-sm outline-none focus:border-[#131A2E]"
            />
          </div>

          <button
            type="button"
            onClick={() => aplicar(deLocal, ateLocal)}
            disabled={!deLocal || !ateLocal || deLocal > ateLocal}
            className="border border-[#131A2E] rounded-sm px-3 py-2 text-xs font-semibold tracking-wide text-[#131A2E] hover:bg-[#131A2E] hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#131A2E]"
          >
            APLICAR
          </button>
        </div>
      )}
    </div>
  )
}
