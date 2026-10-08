'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Câmera dentro do portal, com moldura de enquadramento para a nota.
 *
 * - Abre a câmera traseira em tela cheia (getUserMedia; exige HTTPS).
 * - Moldura no formato da nota: "Nota" (A4/DANFE, retrato) ou "Cupom"
 *   (estreito e comprido). Fora dela a imagem escurece.
 * - A foto sai já recortada na moldura, com uma pequena margem — menos fundo
 *   para a IA ignorar e mais pixels na própria nota.
 * - Lanterna quando o aparelho permite.
 * - Sem permissão ou sem suporte, oferece a câmera do próprio celular
 *   (o input de arquivo de antes), que não tem moldura mas sempre funciona.
 */

type Formato = 'nota' | 'cupom'
/** Altura ÷ largura da moldura. */
const PROPORCAO: Record<Formato, number> = { nota: 1.414, cupom: 2.6 }
/** Margem em volta da moldura que também vai na foto. */
const FOLGA = 0.04

type Caixa = { x: number; y: number; w: number; h: number }

export default function CameraNota({
  onFoto,
  onFechar,
  onCameraDoCelular,
}: {
  onFoto: (arquivo: File) => void
  onFechar: () => void
  onCameraDoCelular: () => void
}) {
  const palco = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const fluxo = useRef<MediaStream | null>(null)
  const [formato, setFormato] = useState<Formato>('nota')
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 })
  const [pronta, setPronta] = useState(false)
  const [falha, setFalha] = useState('')
  const [temLanterna, setTemLanterna] = useState(false)
  const [lanterna, setLanterna] = useState(false)
  const [foto, setFoto] = useState<{ arquivo: File; url: string } | null>(null)

  // Liga a câmera ao abrir e desliga ao fechar
  useEffect(() => {
    let cancelado = false
    async function ligar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFalha('Este navegador não deixa o portal abrir a câmera.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        })
        if (cancelado) return s.getTracks().forEach((t) => t.stop())
        fluxo.current = s
        const trilha = s.getVideoTracks()[0]
        const cap = (trilha.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] }
        setTemLanterna(!!cap.torch)
        if (cap.focusMode?.includes('continuous')) {
          trilha.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
        }
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => {})
        }
      } catch (e) {
        const nome = (e as { name?: string })?.name
        setFalha(
          nome === 'NotAllowedError'
            ? 'A câmera foi bloqueada. Libere o acesso à câmera para este site nas configurações do navegador, ou use a câmera do celular.'
            : nome === 'NotFoundError'
              ? 'Nenhuma câmera encontrada neste aparelho.'
              : 'Não foi possível abrir a câmera.'
        )
      }
    }
    ligar()
    return () => {
      cancelado = true
      fluxo.current?.getTracks().forEach((t) => t.stop())
      fluxo.current = null
    }
  }, [])

  // Trava a rolagem da página por trás
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  // Acompanha o tamanho da tela (girar o celular muda a moldura)
  useLayoutEffect(() => {
    const el = palco.current
    if (!el) return
    const medir = () => setTamanho({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Libera a prévia ao trocar ou sair
  useEffect(() => () => {
    if (foto) URL.revokeObjectURL(foto.url)
  }, [foto])

  // Moldura: o maior retângulo no formato que cabe com respiro
  const moldura: Caixa = (() => {
    const { w, h } = tamanho
    if (!w || !h) return { x: 0, y: 0, w: 0, h: 0 }
    const p = PROPORCAO[formato]
    let fw = w * 0.86
    let fh = fw * p
    const maxH = h * 0.7
    if (fh > maxH) {
      fh = maxH
      fw = fh / p
    }
    return { x: (w - fw) / 2, y: (h - fh) / 2 - h * 0.03, w: fw, h: fh }
  })()

  async function alternarLanterna() {
    const trilha = fluxo.current?.getVideoTracks()[0]
    if (!trilha) return
    try {
      await trilha.applyConstraints({ advanced: [{ torch: !lanterna } as MediaTrackConstraintSet] })
      setLanterna(!lanterna)
    } catch {
      setTemLanterna(false)
    }
  }

  function capturar() {
    const v = video.current
    if (!v || !v.videoWidth) return
    // O vídeo aparece em "cover": converte a moldura da tela para pixels do vídeo
    const escala = Math.max(tamanho.w / v.videoWidth, tamanho.h / v.videoHeight)
    const ox = (tamanho.w - v.videoWidth * escala) / 2
    const oy = (tamanho.h - v.videoHeight * escala) / 2
    const fx = moldura.w * FOLGA
    const fy = moldura.h * FOLGA
    let sx = (moldura.x - fx - ox) / escala
    let sy = (moldura.y - fy - oy) / escala
    let sw = (moldura.w + 2 * fx) / escala
    let sh = (moldura.h + 2 * fy) / escala
    sx = Math.max(0, sx)
    sy = Math.max(0, sy)
    sw = Math.min(v.videoWidth - sx, sw)
    sh = Math.min(v.videoHeight - sy, sh)

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sw)
    canvas.height = Math.round(sh)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const arquivo = new File([blob], `nota-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setFoto({ arquivo, url: URL.createObjectURL(blob) })
      },
      'image/jpeg',
      0.92
    )
  }

  const cantos = 'absolute w-7 h-7 border-white'

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col select-none" role="dialog" aria-label="Fotografar nota">
      <div ref={palco} className="relative flex-1 overflow-hidden">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setPronta(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {!falha && moldura.w > 0 && (
          <>
            {/* Escurece fora da moldura */}
            <div
              className="absolute rounded-sm pointer-events-none"
              style={{
                left: moldura.x,
                top: moldura.y,
                width: moldura.w,
                height: moldura.h,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                outline: '1px solid rgba(255,255,255,0.5)',
              }}
            >
              <span className={cantos + ' -left-0.5 -top-0.5 border-l-4 border-t-4'} />
              <span className={cantos + ' -right-0.5 -top-0.5 border-r-4 border-t-4'} />
              <span className={cantos + ' -left-0.5 -bottom-0.5 border-l-4 border-b-4'} />
              <span className={cantos + ' -right-0.5 -bottom-0.5 border-r-4 border-b-4'} />
            </div>
            <p
              className="absolute left-0 right-0 text-center text-sm font-semibold px-6 drop-shadow"
              style={{ top: Math.max(12, moldura.y - 44) }}
            >
              Encaixe a nota inteira dentro da moldura
            </p>
            <p
              className="absolute left-0 right-0 text-center text-xs text-white/80 px-6 drop-shadow"
              style={{ top: moldura.y + moldura.h + 12 }}
            >
              Nota apoiada numa mesa, com luz, sem sombra e sem reflexo
            </p>
          </>
        )}

        {!pronta && !falha && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">abrindo a câmera…</p>}

        {falha && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm leading-relaxed">{falha}</p>
            <button onClick={onCameraDoCelular} className="bg-white text-[#131A2E] rounded-sm px-5 py-3 text-xs font-bold tracking-wide">
              USAR A CÂMERA DO CELULAR
            </button>
          </div>
        )}

        {foto && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="Foto da nota" className="max-h-full max-w-full object-contain rounded-sm" />
          </div>
        )}
      </div>

      {/* Barra de controles */}
      <div className="shrink-0 bg-black px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {foto ? (
          <div className="flex gap-3">
            <button onClick={() => setFoto(null)} className="flex-1 border border-white/60 rounded-sm py-3 text-xs font-bold tracking-wide">
              TIRAR OUTRA
            </button>
            <button onClick={() => onFoto(foto.arquivo)} className="flex-1 bg-white text-[#131A2E] rounded-sm py-3 text-xs font-bold tracking-wide">
              USAR ESTA FOTO
            </button>
          </div>
        ) : (
          <>
            {!falha && (
              <div className="flex justify-center gap-2 mb-3">
                {(['nota', 'cupom'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormato(f)}
                    className={'rounded-full px-3 py-1 text-xs ' + (formato === f ? 'bg-white text-[#131A2E] font-semibold' : 'bg-white/15')}
                  >
                    {f === 'nota' ? 'Nota (A4)' : 'Cupom'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <button onClick={onFechar} className="w-20 text-left text-sm">
                Cancelar
              </button>
              <button
                onClick={capturar}
                disabled={!pronta || !!falha}
                aria-label="Fotografar"
                className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30"
              >
                <span className="w-12 h-12 rounded-full bg-white" />
              </button>
              <div className="w-20 text-right">
                {temLanterna && !falha && (
                  <button onClick={alternarLanterna} className="text-sm">
                    {lanterna ? 'Luz: ligada' : 'Luz'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
