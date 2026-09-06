'use client'

import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function Visualizador() {
  const params = useSearchParams()
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [erro, setErro] = useState('')

  const ids = params.get('ids') ?? ''
  const url = `/api/romaneio?ids=${ids}`

  function imprimir() {
    const janela = iframeRef.current?.contentWindow
    if (!janela) return setErro('Aguarde o romaneio terminar de carregar.')

    try {
      janela.focus()
      janela.print()
    } catch {
      // Alguns navegadores bloqueiam imprimir PDF embutido — abre direto
      window.open(url, '_blank')
    }
  }

  function voltar() {
    // Costuma ser aberto em nova aba pelo painel do pedido
    window.close()
    // Se não era aba aberta por script, close() não faz nada
    setTimeout(() => router.push('/admin/pedidos'), 120)
  }

  if (!ids) {
    return (
      <p className="text-sm text-[#6E6E68]">Nenhum pedido selecionado.</p>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
          Romaneio de calandra
        </h1>

        <div className="flex items-center gap-2">
          <button
            onClick={voltar}
            className="border border-[#131A2E] rounded-sm px-4 py-2.5 text-xs font-semibold tracking-wide"
          >
            VOLTAR
          </button>
          <button
            onClick={imprimir}
            className="bg-[#131A2E] text-white rounded-sm px-4 py-2.5 text-xs font-semibold tracking-wide"
          >
            IMPRIMIR
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-[#B00063] mb-3">{erro}</p>}

      <iframe
        ref={iframeRef}
        src={url}
        title="Romaneio de calandra"
        className="w-full h-[70vh] bg-white border border-[#DDDCD5] rounded-sm"
      />
    </div>
  )
}

export default function RomaneioPage() {
  return (
    <Suspense fallback={null}>
      <Visualizador />
    </Suspense>
  )
}
