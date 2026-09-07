/**
 * Converte a primeira página de um PDF em imagem, no navegador.
 * O arquivo original nunca sai da máquina do usuário — só o WebP gerado
 * a partir dele é enviado, igual ao fluxo de imagem comum.
 */

const LADO_ALVO = 1600 // resolução de render antes da redução final

export type ResultadoPdf =
  | { ok: true; bitmap: ImageBitmap; paginas: number }
  | { ok: false; erro: string }

export async function primeiraPaginaDoPdf(file: File): Promise<ResultadoPdf> {
  // Carrega o pdf.js só quando um PDF é escolhido: a biblioteca é pesada
  // e a maioria dos envios continua sendo imagem.
  const pdfjs = await import('pdfjs-dist')

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  try {
    const dados = new Uint8Array(await file.arrayBuffer())
    const tarefa = pdfjs.getDocument({ data: dados })
    const documento = await tarefa.promise
    const pagina = await documento.getPage(1)

    const escalaBase = pagina.getViewport({ scale: 1 })
    const escala = LADO_ALVO / Math.max(escalaBase.width, escalaBase.height)
    const viewport = pagina.getViewport({ scale: escala })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { ok: false, erro: 'Seu navegador não suporta a leitura do PDF.' }
    }

    // PDF costuma ter fundo transparente; sem isso a arte sai com fundo preto
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await pagina.render({ canvas, canvasContext: ctx, viewport }).promise

    const bitmap = await createImageBitmap(canvas)
    const paginas = documento.numPages

    // Encerra o worker do pdf.js, senão fica rodando em segundo plano
    tarefa.destroy()
    return { ok: true, bitmap, paginas }
  } catch {
    return {
      ok: false,
      erro: 'Não foi possível ler o PDF. Ele pode estar protegido por senha.',
    }
  }
}
