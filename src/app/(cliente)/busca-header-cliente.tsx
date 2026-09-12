'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { buscarGeralCliente, type ResultadoBuscaCliente } from '@/app/actions/busca'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Busca geral do cliente — atrás da lupa, igual ao painel. */
export default function BuscaHeaderCliente() {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultado, setResultado] = useState<ResultadoBuscaCliente | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto) return

    campo.current?.focus()

    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aberto])

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultado(null)
      return
    }

    const id = setTimeout(() => {
      iniciar(async () => {
        setResultado(await buscarGeralCliente(termo))
      })
    }, 300)

    return () => clearTimeout(id)
  }, [termo])

  function fechar() {
    setAberto(false)
    setTermo('')
    setResultado(null)
  }

  function irParaResultados() {
    if (termo.trim().length < 2) return
    const q = termo
    fechar()
    router.push(`/busca?q=${encodeURIComponent(q)}`)
  }

  const temResultado =
    resultado && (resultado.pedidos.length > 0 || resultado.artes.length > 0)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Busca geral"
        aria-expanded={aberto}
        className="w-9 h-9 flex items-center justify-center rounded-sm text-[#6E6E68] hover:text-[#131A2E] hover:bg-[#F2F1ED]"
      >
        <Lupa />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[#131A2E]/40" onClick={fechar} />

          <div className="relative bg-white border-b border-[#DDDCD5] shadow-lg">
            <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
              <span aria-hidden className="text-[#B8B7B0] shrink-0">
                <Lupa />
              </span>

              <input
                ref={campo}
                type="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && irParaResultados()}
                placeholder="Buscar pedido ou arte..."
                className="flex-1 min-w-0 text-base sm:text-sm outline-none bg-transparent"
              />

              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar busca"
                className="text-xs tracking-widest text-[#6E6E68] hover:text-[#131A2E] shrink-0"
              >
                FECHAR
              </button>
            </div>

            {termo.trim().length >= 2 && (
              <div className="max-w-3xl mx-auto px-5 pb-3">
                <div className="border border-[#DDDCD5] rounded-sm max-h-[70vh] overflow-y-auto">
                  {pendente && (
                    <p className="text-xs text-[#6E6E68] p-3">Buscando...</p>
                  )}

                  {!pendente && !temResultado && (
                    <p className="text-xs text-[#6E6E68] p-3">
                      Nenhum resultado.
                    </p>
                  )}

                  {!pendente && resultado && resultado.pedidos.length > 0 && (
                    <div className="p-2">
                      <p className="text-[9px] tracking-widest text-[#6E6E68] px-2 mb-1">
                        PEDIDOS
                      </p>
                      {resultado.pedidos.map((p) => (
                        <Link
                          key={p.id}
                          href={`/pedidos/${p.id}`}
                          onClick={fechar}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm"
                        >
                          <span>Pedido #{p.numero}</span>
                          <span className="font-mono text-xs text-[#6E6E68]">
                            R$ {brl(p.total)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {!pendente && resultado && resultado.artes.length > 0 && (
                    <div className="p-2 border-t border-[#DDDCD5]">
                      <p className="text-[9px] tracking-widest text-[#6E6E68] px-2 mb-1">
                        ARTES
                      </p>
                      {resultado.artes.map((a) => (
                        <Link
                          key={a.id}
                          href="/catalogo"
                          onClick={fechar}
                          className="block px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm truncate"
                        >
                          <span className="font-mono text-xs text-[#6E6E68]">
                            {a.sku}
                          </span>{' '}
                          {a.nome}
                        </Link>
                      ))}
                    </div>
                  )}

                  {!pendente && temResultado && (
                    <button
                      onClick={irParaResultados}
                      className="w-full text-left px-2 py-2 text-xs font-semibold tracking-wide text-[#0090D8] hover:bg-[#FAFAF7] border-t border-[#DDDCD5]"
                    >
                      VER TODOS OS RESULTADOS →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Lupa() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
