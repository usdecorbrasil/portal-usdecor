/**
 * Reduz uma imagem no navegador antes do upload.
 * O arquivo original nunca sai da máquina do usuário.
 */

const LADO_MAX = 800        // pixels no maior lado
const QUALIDADE = 0.82      // 0 a 1
const TAMANHO_MAX = 400_000 // recusa entrada acima de ~400 MB

export type ResultadoReducao =
  | { ok: true; arquivo: Blob; largura: number; altura: number; kb: number }
  | { ok: false; erro: string }

export async function reduzirImagem(file: File): Promise<ResultadoReducao> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, erro: 'Selecione um arquivo de imagem (PNG, JPG ou WebP).' }
  }

  if (file.size > TAMANHO_MAX * 1024) {
    return { ok: false, erro: 'Imagem muito grande. Máximo 400 MB.' }
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, erro: 'Não foi possível ler a imagem. Tente PNG, JPG ou WebP.' }
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
  }
}