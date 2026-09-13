import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Bucket `documentos`: DANFE, XML e boletos por pedido. Privado — quem lê
 * recebe um link assinado de uma hora, gerado na hora de montar a tela.
 */
const BUCKET = 'documentos'

export async function salvarDocumento(
  caminho: string,
  conteudo: Buffer,
  contentType: string
): Promise<string | null> {
  const admin = createAdminClient()

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(caminho, conteudo, { contentType, upsert: true })

  if (error) {
    console.error('[documentos] upload', caminho, error.message)
    return null
  }

  return caminho
}

export async function urlDocumento(
  caminho: string | null | undefined
): Promise<string | null> {
  if (!caminho) return null

  const admin = createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 3600)

  return data?.signedUrl ?? null
}

/** Baixa um arquivo público (DANFE, boleto) para guardar em `documentos`. */
export async function baixarArquivo(
  url: string
): Promise<{ conteudo: Buffer; contentType: string } | null> {
  try {
    const r = await fetch(url, { redirect: 'follow' })
    if (!r.ok) return null

    const contentType = (r.headers.get('content-type') ?? '').split(';')[0].trim()
    const conteudo = Buffer.from(await r.arrayBuffer())

    if (conteudo.length === 0) return null

    return { conteudo, contentType: contentType || 'application/octet-stream' }
  } catch (e) {
    console.error('[documentos] download', url, e)
    return null
  }
}
