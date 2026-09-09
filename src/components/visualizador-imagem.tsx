'use client'

import { useEffect } from 'react'

export default function Visualizador({
  url,
  sku,
  nome,
  aoFechar,
}: {
  url: string
  sku: string
  nome: string
  aoFechar: () => void
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${sku} — ${nome}`}
    >
      <div className="absolute inset-0 bg-[#131A2E]/80" onClick={aoFechar} />

      <div className="relative max-w-2xl w-full">
        <button
          onClick={aoFechar}
          aria-label="Fechar"
          className="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl leading-none"
        >
          ✕
        </button>

        <img
          src={url}
          alt={nome}
          className="w-full max-h-[75vh] object-contain rounded-sm bg-white"
        />

        <div className="mt-3 text-center">
          <div className="text-xs font-mono text-white/60 tracking-wide">
            {sku}
          </div>
          <div className="text-white font-semibold tracking-tight mt-0.5">
            {nome}
          </div>
        </div>
      </div>
    </div>
  )
}