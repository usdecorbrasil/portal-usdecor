'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { buscarGeral, type ResultadoBusca } from '@/app/actions/busca'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function VerMais({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1 text-[10px] font-semibold tracking-wide text-[#0090D8] hover:bg-[#FAFAF7] rounded-sm"
    >
      ver mais →
    </button>
  )
}

/**
 * Busca geral do painel — vive atrás da lupa no cabeçalho.
 * O campo só aparece quando pedido, para não competir com a busca da página,
 * que é o caminho do dia a dia.
 */
export default function BuscaHeader() {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null)
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
        setResultado(await buscarGeral(termo))
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
    router.push(`/admin/busca?q=${encodeURIComponent(q)}`)
  }

  const temResultado =
    resultado &&
    (resultado.pedidos.length > 0 ||
      resultado.clientes.length > 0 ||
      resultado.artes.length > 0)

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
            <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3">
              <span aria-hidden className="text-[#B8B7B0] shrink-0">
                <Lupa />
              </span>

              <input
                ref={campo}
                type="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && irParaResultados()}
                placeholder="Buscar pedido, cliente, arte..."
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
              <div className="max-w-5xl mx-auto px-5 pb-3">
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
                          href={`/admin/pedidos/${p.id}`}
                          onClick={fechar}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="truncate block">
                              <span className="font-mono text-xs text-[#6E6E68]">
                                {p.numero}
                              </span>{' '}
                              {p.clienteNome}
                            </span>
                            <span
                              className={`text-[10px] ${
                                p.emAndamento
                                  ? 'text-[#B00063]'
                                  : 'text-[#6E6E68]'
                              }`}
                            >
                              {p.statusLabel}
                            </span>
                          </span>
                          {p.total !== null && p.total > 0 && (
                            <span className="font-mono text-xs text-[#6E6E68] shrink-0">
                              R$ {brl(p.total)}
                            </span>
                          )}
                        </Link>
                      ))}
                      {resultado.temMais.pedidos && (
                        <VerMais onClick={irParaResultados} />
                      )}
                    </div>
                  )}

                  {!pendente && resultado && resultado.clientes.length > 0 && (
                    <div className="p-2 border-t border-[#DDDCD5]">
                      <p className="text-[9px] tracking-widest text-[#6E6E68] px-2 mb-1">
                        CLIENTES
                      </p>
                      {resultado.clientes.map((c) => (
                        <Link
                          key={c.id}
                          href={`/admin/clientes/${c.id}`}
                          onClick={fechar}
                          className="block px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm truncate"
                        >
                          {c.razaoSocial}
                        </Link>
                      ))}
                      {resultado.temMais.clientes && (
                        <VerMais onClick={irParaResultados} />
                      )}
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
                          href={`/admin/catalogo/${a.catalogoId}`}
                          onClick={fechar}
                          className="block px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm truncate"
                        >
                          <span className="font-mono text-xs text-[#6E6E68]">
                            {a.sku}
                          </span>{' '}
                          {a.nome}
                        </Link>
                      ))}
                      {resultado.temMais.artes && (
                        <VerMais onClick={irParaResultados} />
                      )}
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
