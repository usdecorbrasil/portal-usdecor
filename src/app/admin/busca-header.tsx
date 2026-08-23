'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { buscarGeral, type ResultadoBusca } from '@/app/actions/busca'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function BuscaHeader() {
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultado(null)
      return
    }

    const id = setTimeout(() => {
      iniciar(async () => {
        const r = await buscarGeral(termo)
        setResultado(r)
        setAberto(true)
      })
    }, 300)

    return () => clearTimeout(id)
  }, [termo])

  function irParaResultados() {
    if (termo.trim().length < 2) return
    setAberto(false)
    router.push(`/admin/busca?q=${encodeURIComponent(termo)}`)
  }

  const temResultado =
    resultado &&
    (resultado.pedidos.length > 0 ||
      resultado.clientes.length > 0 ||
      resultado.artes.length > 0)

  return (
    <div ref={caixa} className="relative flex-1 max-w-xs">
      <input
        type="search"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onFocus={() => termo.trim().length >= 2 && setAberto(true)}
        onKeyDown={(e) => e.key === 'Enter' && irParaResultados()}
        placeholder="Buscar pedido, cliente, arte..."
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-1.5 text-sm outline-none focus:border-[#131A2E]"
      />

      {aberto && termo.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-[#DDDCD5] rounded-sm shadow-lg z-50 max-h-96 overflow-y-auto">
          {pendente && (
            <p className="text-xs text-[#6E6E68] p-3">Buscando...</p>
          )}

          {!pendente && !temResultado && (
            <p className="text-xs text-[#6E6E68] p-3">Nenhum resultado.</p>
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
                  onClick={() => setAberto(false)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm"
                >
                  <span className="truncate">
                    <span className="font-mono text-xs text-[#6E6E68]">
                      #{p.numero}
                    </span>{' '}
                    {p.clienteNome}
                  </span>
                  {p.total !== null && (
                    <span className="font-mono text-xs text-[#6E6E68] shrink-0">
                      R$ {brl(p.total)}
                    </span>
                  )}
                </Link>
              ))}
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
                  onClick={() => setAberto(false)}
                  className="block px-2 py-1.5 text-sm hover:bg-[#FAFAF7] rounded-sm truncate"
                >
                  {c.razaoSocial}
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
                  href={`/admin/catalogo/${a.catalogoId}`}
                  onClick={() => setAberto(false)}
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
      )}
    </div>
  )
}