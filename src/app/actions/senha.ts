'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

/**
 * Primeiro acesso: quem entrou com a senha provisória do convite define a
 * própria senha antes de usar o portal.
 *
 * A senha do convite trafega por e-mail e fica na caixa de entrada de quem
 * recebeu — e de quem tiver acesso a ela. Enquanto for essa a senha da conta,
 * o acesso não é de fato do usuário.
 *
 * A marca de "provisória" vive em `app_metadata`, e não em `user_metadata`,
 * porque o próprio usuário consegue escrever no segundo: ele poderia limpar a
 * marca e continuar com a senha do e-mail. Em `app_metadata` só a chave de
 * serviço escreve, e é o que esta ação faz no fim.
 *
 * Não pede a senha atual: ela acabou de ser usada para entrar.
 */
export async function definirPrimeiraSenha(
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

  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.senha,
  })

  if (error) {
    // O Supabase recusa repetir a senha anterior — que aqui é justamente a do
    // e-mail, o caso que esta tela existe para evitar
    const repetida = error.message.toLowerCase().includes('different')
    return {
      ok: false,
      erro: repetida
        ? 'Escolha uma senha diferente da que veio no e-mail.'
        : 'Não foi possível salvar a senha. Tente novamente.',
    }
  }

  // Só depois de a senha nova estar valendo. Na ordem inversa, uma falha no
  // meio liberaria o portal com a senha do e-mail ainda em pé
  const admin = createAdminClient()

  const { error: erroMarca } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { senha_provisoria: false },
  })

  if (erroMarca) {
    return {
      ok: false,
      erro: 'A senha foi alterada, mas o portal não liberou o acesso. Entre em contato.',
    }
  }

  return { ok: true }
}
