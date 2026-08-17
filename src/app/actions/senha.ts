'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

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