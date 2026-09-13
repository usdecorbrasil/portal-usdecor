'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { urlDoSite } from '@/lib/site'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
})

type Resultado = { ok: true } | { ok: false; erro: string }

export async function pedirRecuperacao(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  const parsed = schema.safeParse({ email: formData.get('email') })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const site = urlDoSite()

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}/auth/confirmar?next=/nova-senha`,
  })

  // Resposta sempre positiva: não revela se o e-mail existe.
  return { ok: true }
}

const schemaNova = z
  .object({
    senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(72),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    message: 'As senhas não coincidem',
    path: ['confirmacao'],
  })

export async function definirNovaSenha(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  const parsed = schemaNova.safeParse({
    senha: formData.get('senha'),
    confirmacao: formData.get('confirmacao'),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, erro: 'Link expirado. Peça um novo e-mail de recuperação.' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.senha,
  })

  if (error) {
    return { ok: false, erro: 'Não foi possível alterar a senha. Tente novamente.' }
  }

  return { ok: true }
}

/**
 * Troca de senha por quem já está logado. Confere a senha atual antes:
 * o Supabase não exige isso, então sem a checagem qualquer sessão aberta
 * (num computador compartilhado, por exemplo) trocaria a senha da conta.
 */
export async function alterarMinhaSenha(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  const parsed = z.object({
    atual: z.string().min(1, 'Informe a senha atual'),
    senha: z.string().min(8, 'A nova senha precisa de ao menos 8 caracteres'),
    confirmacao: z.string(),
  }).refine((d) => d.senha === d.confirmacao, {
    message: 'A confirmação não confere com a nova senha',
    path: ['confirmacao'],
  }).safeParse({
    atual: formData.get('atual'),
    senha: formData.get('senha'),
    confirmacao: formData.get('confirmacao'),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { ok: false, erro: 'Sessão expirada. Entre novamente.' }
  }

  const { error: erroSenha } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.atual,
  })

  if (erroSenha) {
    return { ok: false, erro: 'Senha atual incorreta.' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.senha,
  })

  if (error) {
    return { ok: false, erro: 'Não foi possível alterar a senha. Tente novamente.' }
  }

  return { ok: true }
}