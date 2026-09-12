'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reordenarFila } from '@/app/actions/fila'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME } from '@/components/estilo-lista'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type ItemFila = {
  id: string
  numero: number
  cliente: string
  unidades: number
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
  const arrastandoRef = useRef<string | null>(null)
  arrastandoRef.current = arrastando

  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Tocar no card abre o pedido, mas só se o gesto não virou arraste
  const houveArraste = useRef(false)

  function abrirPedido(id: string) {
    if (houveArraste.current) {
      houveArraste.current = false
      return
    }
    router.push(`/admin/pedidos/${id}`)
  }

  // Em toque/caneta, exige tocar e segurar parado antes de assumir que é
  // arraste — pra não atrapalhar o gesto normal de rolar a lista.
  const pressTimer = useRef<number | null>(null)
  const pressInfo = useRef<{ id: string; x: number; y: number } | null>(null)

  function cancelarPressPendente() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressInfo.current = null
  }

  function commitReorder(novaLista: ItemFila[], movidoId: string) {
    const pos = novaLista.findIndex((i) => i.id === movidoId)
    const anterior = pos > 0 ? novaLista[pos - 1].id : null
    const posterior = pos < novaLista.length - 1 ? novaLista[pos + 1].id : null

    setErro('')
    iniciar(async () => {
      const r = await reordenarFila(movidoId, anterior, posterior)
      if (!r.ok) {
        setErro(r.erro)
        setLista(itens)
      }
    })
  }

  function moverPara(destinoId: string) {
    const idArrastado = arrastandoRef.current
    if (!idArrastado) return

    setSobre(destinoId)
    if (destinoId === idArrastado) return

    const atual = listaRef.current
    const origem = atual.findIndex((i) => i.id === idArrastado)
    const destino = atual.findIndex((i) => i.id === destinoId)
    if (origem < 0 || destino < 0 || origem === destino) return

    const nova = [...atual]
    const [movido] = nova.splice(origem, 1)
    nova.splice(destino, 0, movido)
    setLista(nova)
    houveArraste.current = true
  }

  function finalizarArraste() {
    const id = arrastandoRef.current
    if (!id) return
    setArrastando(null)
    setSobre(null)
    commitReorder(listaRef.current, id)
  }

  // Arraste por mouse: usa Pointer Events normalmente, sem conflito de scroll.
  function aoPointerDown(e: React.PointerEvent, id: string) {
    if (!podeReordenar || e.pointerType !== 'mouse') return
    if ((e.target as HTMLElement).closest('a, button')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setArrastando(id)
  }

  function aoPointerMove(e: React.PointerEvent) {
    if (!arrastando || e.pointerType !== 'mouse') return
    const alvo = document.elementFromPoint(e.clientX, e.clientY)
    const cartao = alvo?.closest('[data-item-id]') as HTMLElement | null
    if (cartao?.dataset.itemId) moverPara(cartao.dataset.itemId)
  }

  function aoPointerUp(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return
    finalizarArraste()
  }

  // Arraste por toque/caneta: eventos nativos com preventDefault não-passivo,
  // já que Pointer Events não bloqueiam o scroll nativo do iOS de forma
  // confiável no meio do gesto.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !podeReordenar) return

    function aoTocar(e: TouchEvent) {
      const alvo = e.target as HTMLElement
      if (alvo.closest('a, button')) return
      const cartao = alvo.closest('[data-item-id]') as HTMLElement | null
      const id = cartao?.dataset.itemId
      if (!id) return

      const t = e.touches[0]
      cancelarPressPendente()
      pressInfo.current = { id, x: t.clientX, y: t.clientY }
      pressTimer.current = window.setTimeout(() => {
        if (!pressInfo.current) return
        setArrastando(pressInfo.current.id)
        // Segurou para arrastar: o toque não deve abrir o pedido ao soltar
        houveArraste.current = true
        pressInfo.current = null
      }, 350)
    }

    function aoMoverToque(e: TouchEvent) {
      const t = e.touches[0]
      if (!t) return

      if (pressInfo.current) {
        const dx = t.clientX - pressInfo.current.x
        const dy = t.clientY - pressInfo.current.y
        if (Math.hypot(dx, dy) > 10) cancelarPressPendente()
        return
      }

      if (!arrastandoRef.current) return
      e.preventDefault()

      const alvo = document.elementFromPoint(t.clientX, t.clientY)
      const cartao = alvo?.closest('[data-item-id]') as HTMLElement | null
      if (cartao?.dataset.itemId) moverPara(cartao.dataset.itemId)
    }

    function aoSoltarToque() {
      cancelarPressPendente()
      finalizarArraste()
    }

    container.addEventListener('touchstart', aoTocar, { passive: true })
    container.addEventListener('touchmove', aoMoverToque, { passive: false })
    container.addEventListener('touchend', aoSoltarToque)
    container.addEventListener('touchcancel', aoSoltarToque)

    return () => {
      container.removeEventListener('touchstart', aoTocar)
      container.removeEventListener('touchmove', aoMoverToque)
      container.removeEventListener('touchend', aoSoltarToque)
      container.removeEventListener('touchcancel', aoSoltarToque)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeReordenar])

  // Trava o scroll da página inteira enquanto arrasta (reforço extra além
  // do preventDefault — ajuda em navegadores onde touch-action é lento).
  useEffect(() => {
    if (!arrastando) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowAnterior
    }
  }, [arrastando])

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

      <div className={CAIXA + (pendente ? ' opacity-60' : '')}>
        <div className={CABECALHO}>
          <span className="w-6 shrink-0 text-center">#</span>
          <span className="w-9 shrink-0">Nº</span>
          <span className="flex-1 min-w-0">Cliente</span>
          <span className="w-11 shrink-0 text-right hidden sm:block">Desde</span>
          <span className="w-12 shrink-0 text-right hidden sm:block">Artes</span>
          <span className="w-14 shrink-0 text-right">Qtd</span>
          {podeReordenar && <span aria-hidden className="w-7 shrink-0" />}
        </div>

        <div ref={containerRef} className={CORPO}>
          {lista.map((item, idx) => (
            <div
              key={item.id}
              data-item-id={item.id}
              data-busca={`${item.numero} ${item.cliente}`}
              onPointerDown={(e) => aoPointerDown(e, item.id)}
              onPointerMove={aoPointerMove}
              onPointerUp={aoPointerUp}
              onPointerCancel={aoPointerUp}
              onClick={(e) => {
                // As setas de reordenar ficam dentro da linha
                if ((e.target as HTMLElement).closest('button')) return
                abrirPedido(item.id)
              }}
              style={
                podeReordenar
                  ? {
                      touchAction: 'pan-y',
                      cursor: arrastando === item.id ? 'grabbing' : 'grab',
                    }
                  : { cursor: 'pointer' }
              }
              className={`flex items-stretch bg-white hover:bg-[#FAFAF8] transition-colors select-none ${
                sobre === item.id && arrastando && arrastando !== item.id
                  ? 'ring-1 ring-inset ring-[#B00063]'
                  : ''
              } ${arrastando === item.id ? 'opacity-50' : ''}`}
            >
              {/* a ordem de produção é o dado mais importante daqui */}
              <div className="w-6 shrink-0 bg-[#131A2E] text-white flex items-center justify-center font-mono font-semibold text-[11px] tabular-nums">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5">
                <span className={NUM + ' w-9 shrink-0 text-[#6E6E68]'}>
                  {item.numero}
                </span>

                <span className={NOME + ' flex-1 min-w-0'}>{item.cliente}</span>

                {item.reimpressao && (
                  <span className={ETIQUETA + ' bg-[#FBF0D9] text-[#C79600]'}>
                    reimpressão
                  </span>
                )}

                <span className={NUM + ' w-11 shrink-0 text-right text-[#9B9A93] hidden sm:block'}>
                  {new Date(item.desde).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>

                <span className={NUM + ' w-12 shrink-0 text-right text-[#6E6E68] hidden sm:block'}>
                  {item.artes}
                </span>

                <span className={NUM + ' w-14 shrink-0 text-right font-semibold'}>
                  {item.unidades} un
                </span>

                <span className="text-[#DDDCD5] shrink-0 leading-none">›</span>
              </div>

              {podeReordenar && (
                <div className="w-7 shrink-0 border-l border-[#EFEEE8] flex flex-col">
                  <button
                    onClick={() => mover(item.id, -1)}
                    disabled={idx === 0 || pendente}
                    aria-label="Subir"
                    className="flex-1 cursor-pointer text-[9px] text-[#6E6E68] hover:bg-[#F2F1ED] disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => mover(item.id, 1)}
                    disabled={idx === lista.length - 1 || pendente}
                    aria-label="Descer"
                    className="flex-1 cursor-pointer border-t border-[#EFEEE8] text-[9px] text-[#6E6E68] hover:bg-[#F2F1ED] disabled:opacity-25 disabled:cursor-not-allowed"
                  >
                    ▼
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {podeReordenar && (
        <p className="text-[11px] text-[#6E6E68] mt-3 leading-relaxed">
          Toque e segure em qualquer parte da linha para arrastar, ou use as
          setas — mais prático no celular.
        </p>
      )}
    </div>
  )
}
