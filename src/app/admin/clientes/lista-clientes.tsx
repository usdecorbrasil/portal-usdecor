'use client'

import Link from 'next/link'
import { useState } from 'react'

type Cliente = {
  id: string
  razao_social: string
  cnpj: string
  email: string
  preco_metro: number
  limite_credito: number
  ativo: boolean
  temAtraso: boolean
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatarCnpj(c: string) {
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export default function ListaClientes({
  clientes,
  arquivados,
}: {
  clientes: Cliente[]
  arquivados: Cliente[]
}) {
  const [verArquivados, setVerArquivados] = useState(false)

  return (
    <div className="mt-8">
      {arquivados.length > 0 && (
        <div className="flex mb-4">
          <button
            onClick={() => setVerArquivados((v) => !v)}
            className="shrink-0 border border-[#DDDCD5] rounded-sm px-4 py-2 text-xs font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            {verArquivados ? 'OCULTAR' : 'VER'} ARQUIVADOS ({arquivados.length})
          </button>
        </div>
      )}

      <div className="space-y-1.5 sm:space-y-2">
        {clientes.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clientes/${c.id}`}
            data-busca={`${c.razao_social} ${c.cnpj} ${c.email}`}
            className={`flex items-center gap-3 bg-white border rounded-sm p-2.5 sm:p-4 hover:border-[#131A2E] ${
              c.temAtraso ? 'border-[#B00063]' : 'border-[#DDDCD5]'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold tracking-tight text-sm sm:text-base truncate">
                  {c.razao_social}
                </h2>
                {!c.ativo && (
                  <span className="text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-[#EAE9E3] text-[#6E6E68] shrink-0">
                    inativo
                  </span>
                )}
                {c.temAtraso && (
                  <span className="text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-[#B00063] text-white shrink-0">
                    boleto em atraso
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5 font-mono">
                {formatarCnpj(c.cnpj)}
              </p>
              <p className="text-[10px] sm:text-xs text-[#6E6E68]">{c.email}</p>
            </div>

            <div className="text-right shrink-0">
              <div className="flex items-baseline gap-1.5 justify-end">
                <span className="text-[8px] sm:text-[9px] font-mono tracking-widest uppercase text-[#6E6E68]">
                  R$/m
                </span>
                <span className="font-mono font-semibold text-xs sm:text-sm">
                  {brl(c.preco_metro)}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 justify-end mt-0.5 sm:mt-1">
                <span className="text-[9px] font-mono tracking-widest uppercase text-[#6E6E68]">
                  limite
                </span>
                <span className="font-mono text-sm text-[#6E6E68]">
                  {c.limite_credito > 0 ? `R$ ${brl(c.limite_credito)}` : '—'}
                </span>
              </div>
            </div>

            <span className="text-[#DDDCD5] shrink-0">›</span>
          </Link>
        ))}

        {clientes.length === 0 && (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm py-12 text-center">
            <p className="text-sm text-[#6E6E68]">
              Nenhum cliente cadastrado ainda.
            </p>
          </div>
        )}
      </div>

      {verArquivados && arquivados.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            ARQUIVADOS
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h3>
          <div className="space-y-2">
            {arquivados.map((c) => (
              <div
                key={c.id}
                data-busca={`${c.razao_social} ${c.cnpj} ${c.email}`}
                className="bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm p-4 opacity-70"
              >
                <h3 className="font-semibold tracking-tight truncate">
                  {c.razao_social}
                </h3>
                <p className="text-xs text-[#6E6E68] mt-0.5 font-mono">
                  {formatarCnpj(c.cnpj)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}