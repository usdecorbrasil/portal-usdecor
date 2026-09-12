'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'

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

      <div className={CAIXA}>
        <div className={CABECALHO}>
          <span className="flex-1 min-w-0">Cliente</span>
          <span className="w-32 shrink-0 hidden sm:block">CNPJ</span>
          <span className="w-16 shrink-0 text-right">R$/m</span>
          <span className="w-20 shrink-0 text-right hidden sm:block">Limite</span>
          <span aria-hidden className="w-2 shrink-0" />
        </div>

        <div className={CORPO}>
          {clientes.map((c) => (
            <Link
              key={c.id}
              href={`/admin/clientes/${c.id}`}
              data-busca={`${c.razao_social} ${c.cnpj} ${c.email}`}
              className="flex items-stretch bg-white hover:bg-[#FAFAF8]"
            >
              {/* tarja: vermelha quando há boleto em atraso */}
              <span
                aria-hidden
                className={
                  'w-1 shrink-0 ' +
                  (c.temAtraso ? 'bg-[#B00063]' : c.ativo ? 'bg-transparent' : 'bg-[#DDDCD5]')
                }
              />

              <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={NOME}>{c.razao_social}</span>
                    {!c.ativo && (
                      <span className={ETIQUETA + ' bg-[#EAE9E3] text-[#6E6E68]'}>
                        inativo
                      </span>
                    )}
                    {c.temAtraso && (
                      <span className={ETIQUETA + ' bg-[#B00063] text-white'}>
                        atraso
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#9B9A93] truncate block sm:hidden">
                    {formatarCnpj(c.cnpj)}
                  </span>
                </div>

                <span className={NUM + ' w-32 shrink-0 text-[#6E6E68] hidden sm:block'}>
                  {formatarCnpj(c.cnpj)}
                </span>

                <span
                  className={
                    NUM +
                    ' w-16 shrink-0 text-right font-semibold ' +
                    (c.preco_metro > 0 ? 'text-[#131A2E]' : 'text-[#C79600]')
                  }
                >
                  {c.preco_metro > 0 ? brl(c.preco_metro) : '—'}
                </span>

                <span className={NUM + ' w-20 shrink-0 text-right text-[#6E6E68] hidden sm:block'}>
                  {c.limite_credito > 0 ? brl(c.limite_credito) : '—'}
                </span>

                <span className="text-[#DDDCD5] shrink-0 leading-none">›</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {clientes.length === 0 && (
        <div className={VAZIO}>Nenhum cliente cadastrado ainda.</div>
      )}

      {verArquivados && arquivados.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
            ARQUIVADOS
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h3>
          <div className={CAIXA + ' opacity-70'}>
            <div className={CORPO}>
              {arquivados.map((c) => (
                <div
                  key={c.id}
                  data-busca={`${c.razao_social} ${c.cnpj} ${c.email}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-[#FAFAF7]"
                >
                  <span className={NOME + ' flex-1 min-w-0'}>
                    {c.razao_social}
                  </span>
                  <span className={NUM + ' shrink-0 text-[#9B9A93]'}>
                    {formatarCnpj(c.cnpj)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}