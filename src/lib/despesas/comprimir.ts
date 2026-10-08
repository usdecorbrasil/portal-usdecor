/**
 * Compressão da foto da nota no navegador, antes de subir: usada na captura
 * da nota nova e no "Anexar comprovante" de uma conta já lançada.
 */

/** Reduz a foto no aparelho: lado maior 1600 px, JPEG 82%. PDF passa direto. */
export async function comprimir(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith('image/')) return arquivo
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const maior = Math.max(bitmap.width, bitmap.height)
    const fator = maior > 1600 ? 1600 / maior : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * fator)
    canvas.height = Math.round(bitmap.height * fator)
    const ctx = canvas.getContext('2d')
    if (!ctx) return arquivo
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob) return arquivo
    return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return arquivo
  }
}
