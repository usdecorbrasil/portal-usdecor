'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

const schema = z.object({
  link: z.string().trim()
    .regex(/^https:\/\/[^\s]{5,500}$/, 'O link precisa começar com https://'),
  observacoes: z.string().trim().max(1000).optional(),
})

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

  const { error } = await supabase
    .from('envios_arte')
    .update({
      situacao: parsed.data.situacao,
      resposta_admin: parsed.data.resposta || null,
      processado_em: new Date().toISOString(),
      processado_por: user.id,
    })
    .eq('id', parsed.data.envioId)

  if (error) return { ok: false, erro: 'Não foi possível atualizar.' }

  revalidatePath('/admin/catalogo')
  revalidatePath('/catalogo')
  return { ok: true }
}