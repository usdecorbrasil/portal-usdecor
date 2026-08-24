'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { reordenarFila } from '@/app/actions/fila'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type ItemFila = {
  id: string
  numero: number
  cliente: string
  metros: number
  artes: number
  reimpressao: boolean
  desde: string
}

export default function ListaFila({
  itens,
  podeReordenar,
}: {
  itens: ItemFila[]
  podeReordenar: boolean
}) {
  const [lista, setLista] = useState(itens)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()
  const listaRef = useRef(lista)
  listaRef.current = lista

  function commitReorder(novaLista: ItemFila[], movidoId: string) {
    const pos = novaLista.findIndex((i) => i.id === movidoId)
    const anterior = pos > 0 ? novaLista[pos - 1].id : null
    const posterior = pos < novaLista.length - 1 ? novaLista[pos + 1].id : null

    setErro('')
    iniciar(async () => {
      const r = await reordenarFila(movidoId, anterior, posterior)
      if (!r.ok) {
        setErro(r.erro)
        setLista(itens) // desfaz se o banco recusar
      }
    })
  }

  // ---- arrasto via Pointer Events (funciona em mouse e toque) ----

  function aoPointerDown(e: React.PointerEvent, id: string) {
    if (!podeReordenar) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setArrastando(id)
  }

  function aoPointerMove(e: React.PointerEvent) {
    if (!arrastando) return

    const alvo = document.elementFromPoint(e.clientX, e.clientY)
    const cartao = alvo?.closest('[data-item-id]') as HTMLElement | null
    const destinoId = cartao?.dataset.itemId
    if (!destinoId) return

    setSobre(destinoId)

    if (destinoId === arrastando) return

    const atual = listaRef.current
    const origem = atual.findIndex((i) => i.id === arrastando)
    const destino = atual.findIndex((i) => i.id === destinoId)
    if (origem < 0 || destino < 0 || origem === destino) return

    const nova = [...atual]
    const [movido] = nova.splice(origem, 1)
    nova.splice(destino, 0, movido)
    setLista(nova)
  }

  function aoPointerUp() {
    if (!arrastando) return
    const id = arrastando
    setArrastando(null)
    setSobre(null)
    commitReorder(listaRef.current, id)
  }

  // ---- setas: alternativa sempre disponível ----

  function mover(id: string, direcao: -1 | 1) {
    const pos = lista.findIndex((i) => i.id === id)
    const alvo = pos + direcao
    if (alvo < 0 || alvo >= lista.length) return

    const nova = [...lista]
    const [movido] = nova.splice(pos, 1)
    nova.splice(alvo, 0, movido)
    setLista(nova)
    commitReorder(nova, id)
  }

  if (lista.length === 0) {
    return (
      <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
        <p className="text-sm text-[#6E6E68]">Nenhum pedido em impressão.</p>
        <p className="text-xs text-[#6E6E68] mt-2">
          Pedidos entram aqui quando a etapa Impressão é lançada.
        </p>
      </div>
    )
  }

  return (
    <div>
      {erro && (
        <p className="text-sm text-[#B00063] bg-white border border-[#B00063] rounded-sm p-3 mb-4">
          {erro}
        </p>
      )}

      <div className={`space-y-2 ${pendente ? 'opacity-60' : ''}`}>
        {lista.map((item, idx) => (
          <div
            key={item.id}
            data-item-id={item.id}
            className={`bg-white border rounded-sm flex items-stretch overflow-hidden transition-colors ${
              sobre === item.id && arrastando && arrastando !== item.id
                ? 'border-[#B00063] border-2'
                : item.reimpressao
                ? 'border-[#E8C36B]'
                : 'border-[#DDDCD5]'
            } ${arrastando === item.id ? 'opacity-50' : ''}`}
          >
            {/* alça de arrasto — posição */}
            <div
              onPointerDown={(e) => aoPointerDown(e, item.id)}
              onPointerMove={aoPointerMove}
              onPointerUp={aoPointerUp}
              onPointerCancel={aoPointerUp}
              style={
                podeReordenar
                  ? { touchAction: 'none', cursor: 'grab' }
                  : undefined
              }
              className="w-11 shrink-0 bg-[#131A2E] text-white flex flex-col items-center justify-center font-mono font-semibold select-none"
            >
              <span>{idx + 1}</span>
              {podeReordenar && (
                <span className="text-[8px] tracking-widest text-white/40 mt-0.5">
                  ⣿
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono font-semibold">#{item.numero}</span>
                <span className="font-mono text-sm whitespace-nowrap">
                  {brl(item.metros)} m
                </span>
              </div>

              <p className="text-sm text-[#6E6E68] mt-0.5 truncate">
                {item.cliente}
              </p>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {item.reimpressao && (
                  <span className="text-[10px] font-mono tracking-wider uppercase bg-[#FBF0D9] text-[#C79600] px-1.5 py-0.5 rounded-sm">
                    reimpressão
                  </span>
                )}
                <span className="text-[10px] text-[#6E6E68]">
                  {item.artes} {item.artes === 1 ? 'arte' : 'artes'}
                </span>
                <span className="text-[10px] text-[#6E6E68]">
                  desde{' '}
                  {new Date(item.desde).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              </div>

              <Link
                href={`/admin/pedidos/${item.id}`}
                className="inline-block text-[10px] tracking-widest text-[#B00063] mt-2"
              >
                ABRIR PEDIDO →
              </Link>
            </div>

            {/* setas: alternativa ao arrasto, essencial no celular */}
            {podeReordenar && (
              <div className="w-9 shrink-0 border-l border-[#DDDCD5] flex flex-col">
                <button
                  onClick={() => mover(item.id, -1)}
                  disabled={idx === 0 || pendente}
                  aria-label="Subir"
                  className="flex-1 text-[#6E6E68] hover:bg-[#FAFAF8] disabled:opacity-25"
                >
                  ▲
                </button>
                <button
                  onClick={() => mover(item.id, 1)}
                  disabled={idx === lista.length - 1 || pendente}
                  aria-label="Descer"
                  className="flex-1 border-t border-[#DDDCD5] text-[#6E6E68] hover:bg-[#FAFAF8] disabled:opacity-25"
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {podeReordenar && (
        <p className="text-xs text-[#6E6E68] mt-4 leading-relaxed">
          Toque e segure o número à esquerda para arrastar, ou use as setas —
          mais prático no celular.
        </p>
      )}
    </div>
  )
}