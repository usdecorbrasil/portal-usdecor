/**
 * Reduz uma imagem no navegador antes do upload.
 * O arquivo original nunca sai da máquina do usuário.
 */

const LADO_MAX = 800        // pixels no maior lado
const QUALIDADE = 0.82      // 0 a 1

/** Piso da busca: abaixo disso a miniatura deixaria de ser reconhecível */
const LADO_MIN = 200
const QUALIDADE_MIN = 0.4

/**
 * O servidor recusa acima de 500 KB. A margem evita que uma diferença de
 * bytes entre navegadores derrube o envio na validação final.
 */
const ALVO_BYTES = 450 * 1024
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

/**
 * Nem todo navegador codifica WebP no canvas. Quando não codifica, ele
 * devolve PNG sem avisar — e PNG ignora o parâmetro de qualidade, o que
 * obrigaria a encolher demais a imagem para caber no limite. Nesses casos
 * JPEG é bem melhor: comprime forte e respeita a qualidade pedida.
 */
function formatoDeSaida(): string {
  const teste = document.createElement('canvas')
  teste.width = 1
  teste.height = 1
  const suportaWebp = teste.toDataURL('image/webp').startsWith('data:image/webp')
  return suportaWebp ? 'image/webp' : 'image/jpeg'
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

  function desenhar(lado: number) {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, largura, altura)

    return { canvas, largura, altura }
  }

  /**
   * A miniatura é só representação visual no catálogo, nunca arquivo de
   * impressão. Então a busca não desiste: baixa a qualidade, depois reduz
   * as dimensões, e repete até caber — por maior que seja o original.
   */
  const formato = formatoDeSaida()

  let blob: Blob | null = null
  let largura = 0
  let altura = 0
  let lado = LADO_MAX
  let qualidade = QUALIDADE

  while (lado >= LADO_MIN) {
    const desenho = desenhar(lado)
    if (!desenho) {
      bitmap.close()
      return {
        ok: false,
        erro: 'Seu navegador não suporta o processamento da imagem.',
      }
    }

    const atual = await new Promise<Blob | null>((resolve) =>
      desenho.canvas.toBlob(resolve, formato, qualidade)
    )

    if (atual) {
      blob = atual
      largura = desenho.largura
      altura = desenho.altura
      if (atual.size <= ALVO_BYTES) break
    }

    // Primeiro sacrifica qualidade; só depois encolhe a imagem
    if (qualidade > QUALIDADE_MIN) {
      qualidade = Math.max(QUALIDADE_MIN, qualidade - 0.15)
    } else {
      lado = Math.round(lado * 0.75)
      qualidade = 0.7
    }
  }

  bitmap.close()

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