/**
 * Reduz uma imagem no navegador antes do upload.
 * O arquivo original nunca sai da máquina do usuário.
 */

const LADO_MAX = 800        // pixels no maior lado
const QUALIDADE = 0.82      // 0 a 1
const TAMANHO_MAX = 400_000 // recusa imagem acima de ~400 MB

/**
 * PDF tem teto bem menor que imagem: ele é lido inteiro na memória do
 * navegador para ser renderizado, e um arquivo enorme trava a aba —
 * sobretudo em celular e tablet.
 */
const TAMANHO_MAX_PDF = 40_000 // ~40 MB

export type ResultadoReducao =
  | {
      ok: true
      arquivo: Blob
      largura: number
      altura: number
      kb: number
      /** Nº de páginas, quando a origem foi um PDF */
      paginasPdf?: number
    }
  | { ok: false; erro: string }

function ehPdf(file: File) {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

export async function reduzirImagem(file: File): Promise<ResultadoReducao> {
  const pdf = ehPdf(file)

  if (!pdf && !file.type.startsWith('image/')) {
    return {
      ok: false,
      erro: 'Selecione uma imagem (PNG, JPG ou WebP) ou um PDF.',
    }
  }

  const teto = pdf ? TAMANHO_MAX_PDF : TAMANHO_MAX

  if (file.size > teto * 1024) {
    return {
      ok: false,
      erro: pdf
        ? `PDF muito grande (${Math.round(file.size / 1024 / 1024)} MB). ` +
          'Máximo 40 MB — exporte em resolução menor ou envie como imagem.'
        : 'Imagem muito grande. Máximo 400 MB.',
    }
  }

  let bitmap: ImageBitmap
  let paginasPdf: number | undefined

  if (pdf) {
    const { primeiraPaginaDoPdf } = await import('./pdf-para-imagem')
    const r = await primeiraPaginaDoPdf(file)
    if (!r.ok) return { ok: false, erro: r.erro }
    bitmap = r.bitmap
    paginasPdf = r.paginas
  } else {
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return {
        ok: false,
        erro: 'Não foi possível ler a imagem. Tente PNG, JPG ou WebP.',
      }
    }
  }

  // Mantém a proporção, limitando o maior lado
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return { ok: false, erro: 'Seu navegador não suporta o processamento da imagem.' }
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALIDADE)
  )

  if (!blob) {
    return { ok: false, erro: 'Falha ao converter a imagem.' }
  }

  return {
    ok: true,
    arquivo: blob,
    largura,
    altura,
    kb: Math.round(blob.size / 1024),
    paginasPdf,
  }
}