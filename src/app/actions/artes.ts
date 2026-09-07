'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

type ResultadoEnvio =
  | { ok: true; envioId: string; clienteId: string }
  | { ok: false; erro: string }

const schema = z.object({
  link: z.string().trim()
    .regex(/^https:\/\/[^\s]{5,500}$/, 'O link precisa começar com https://')
    .optional(),
  observacoes: z.string().trim().max(1000).optional(),
})

/**
 * Abre o envio e devolve o id — o navegador usa esse id para enviar os
 * arquivos direto ao Storage, sem passar pelo servidor (a Vercel limita
 * o corpo da requisição a 4,5 MB, o que não serve para arte).
 */
export async function abrirEnvio(dados: {
  link?: string
  observacoes?: string
}): Promise<ResultadoEnvio> {
  const parsed = schema.safeParse({
    link: dados.link || undefined,
    observacoes: dados.observacoes || undefined,
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('cliente_id, role, ativo')
    .eq('id', user.id)
    .single()

  if (!perfil?.ativo || perfil.role !== 'cliente' || !perfil.cliente_id) {
    return { ok: false, erro: 'Acesso negado.' }
  }

  const { data, error } = await supabase
    .from('envios_arte')
    .insert({
      cliente_id: perfil.cliente_id,
      criado_por: user.id,
      link: parsed.data.link ?? null,
      observacoes: parsed.data.observacoes || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    // O trigger de anti-flood devolve mensagem própria
    return { ok: false, erro: error?.message ?? 'Não foi possível registrar.' }
  }

  return { ok: true, envioId: data.id, clienteId: perfil.cliente_id }
}

/** Confirma o envio depois que os arquivos subiram */
export async function finalizarEnvio(): Promise<Resultado> {
  revalidatePath('/catalogo')
  revalidatePath('/admin/catalogo')
  return { ok: true }
}

/** Cliente envia o link da pasta com as artes novas */
export async function enviarArtes(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  const parsed = schema.safeParse({
    link: formData.get('link'),
    observacoes: formData.get('observacoes') || undefined,
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  if (!parsed.data.link) {
    return { ok: false, erro: 'Informe o link ou anexe os arquivos.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('cliente_id, role, ativo')
    .eq('id', user.id)
    .single()

  if (!perfil?.ativo || perfil.role !== 'cliente' || !perfil.cliente_id) {
    return { ok: false, erro: 'Acesso negado.' }
  }

  // A política do banco confere de novo cliente_id, criado_por e situação
  const { error } = await supabase.from('envios_arte').insert({
    cliente_id: perfil.cliente_id,
    criado_por: user.id,
    link: parsed.data.link,
    observacoes: parsed.data.observacoes || null,
  })

  if (error) {
    // O trigger de anti-flood devolve mensagem própria
    return { ok: false, erro: error.message }
  }

  revalidatePath('/catalogo')
  revalidatePath('/admin/catalogo')
  return { ok: true }
}

/** Equipe atualiza a situação do envio */
export async function atualizarEnvio(
  envioId: string,
  situacao: 'em_analise' | 'cadastrado' | 'rejeitado',
  resposta?: string
): Promise<Resultado> {
  const parsed = z.object({
    envioId: z.string().uuid(),
    situacao: z.enum(['em_analise', 'cadastrado', 'rejeitado']),
    resposta: z.string().trim().max(1000).optional(),
  }).safeParse({ envioId, situacao, resposta })

  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, erro: 'Sessão expirada.' }

  // Ao cadastrar, começa a contagem de 25 dias antes de apagar os
  // arquivos. A carência existe porque o navegador não confirma se o
  // download terminou — sem ela, uma queda de conexão perderia a arte.
  const expiraEm =
    parsed.data.situacao === 'cadastrado'
      ? new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString()
      : null

  const { error } = await supabase
    .from('envios_arte')
    .update({
      situacao: parsed.data.situacao,
      resposta_admin: parsed.data.resposta || null,
      processado_em: new Date().toISOString(),
      processado_por: user.id,
      ...(expiraEm ? { arquivos_expiram_em: expiraEm } : {}),
    })
    .eq('id', parsed.data.envioId)

  if (error) return { ok: false, erro: 'Não foi possível atualizar.' }

  revalidatePath('/admin/catalogo')
  revalidatePath('/catalogo')
  return { ok: true }
}

export type ArquivoEnvio = {
  id: string
  nome: string
  caminho: string
  tamanhoBytes: number
}

/** Links temporários para a equipe baixar os arquivos de um envio */
export async function linksDownload(
  envioId: string
): Promise<{ nome: string; url: string }[]> {
  const supabase = await createClient()

  const { data: arquivos } = await supabase
    .from('envio_arte_arquivos')
    .select('nome, caminho')
    .eq('envio_id', envioId)

  if (!arquivos?.length) return []

  const links: { nome: string; url: string }[] = []

  for (const a of arquivos) {
    const { data } = await supabase.storage
      .from('envios-arte')
      .createSignedUrl(a.caminho, 600, { download: a.nome })

    if (data?.signedUrl) links.push({ nome: a.nome, url: data.signedUrl })
  }

  return links
}