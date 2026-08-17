'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const camposBase = {
  razao_social: z.string().trim().min(2).max(200),
  cnpj: z.string().transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v.length === 14, 'CNPJ deve ter 14 dígitos'),
  email: z.string().trim().toLowerCase().email(),
  contato: z.string().trim().max(120).optional(),
  telefone: z.string().transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v === '' || (v.length >= 10 && v.length <= 13), 'Telefone inválido')
        .optional(),
}

const schemaCriar = z.object(camposBase)
const schemaEditar = z.object({ id: z.string().uuid(), ...camposBase })

type ResultadoCriar = { ok: true; senha: string } | { ok: false; erro: string }
type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && perfil.role === 'admin'
}

function lerCampos(formData: FormData) {
  return {
    razao_social: formData.get('razao_social'),
    cnpj: formData.get('cnpj'),
    email: formData.get('email'),
    contato: formData.get('contato') || undefined,
    telefone: formData.get('telefone') || undefined,
  }
}

export async function criarCliente(
  _prev: unknown,
  formData: FormData
): Promise<ResultadoCriar> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaCriar.safeParse(lerCampos(formData))
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const dados = parsed.data
  const admin = createAdminClient()

  const { data: cliente, error: erroCliente } = await admin
    .from('clientes')
    .insert({
      razao_social: dados.razao_social,
      cnpj: dados.cnpj,
      email: dados.email,
      contato: dados.contato || null,
      telefone: dados.telefone || null,
    })
    .select('id')
    .single()

  if (erroCliente) {
    if (erroCliente.code === '23505') {
      return { ok: false, erro: 'Já existe um cliente com este CNPJ.' }
    }
    return { ok: false, erro: 'Não foi possível cadastrar o cliente.' }
  }

  const senha = gerarSenha()

  const { data: novoUser, error: erroUser } =
    await admin.auth.admin.createUser({
      email: dados.email,
      password: senha,
      email_confirm: true,
    })

  if (erroUser || !novoUser.user) {
    await admin.from('clientes').delete().eq('id', cliente.id)
    return {
      ok: false,
      erro: erroUser?.message.includes('already')
        ? 'Este e-mail já tem acesso ao portal.'
        : 'Não foi possível criar o acesso.',
    }
  }

  const { error: erroPerfil } = await admin.from('profiles').insert({
    id: novoUser.user.id,
    role: 'cliente',
    cliente_id: cliente.id,
    nome: dados.contato || dados.razao_social,
  })

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(novoUser.user.id)
    await admin.from('clientes').delete().eq('id', cliente.id)
    return { ok: false, erro: 'Não foi possível vincular o acesso.' }
  }

  revalidatePath('/admin/clientes')
  return { ok: true, senha }
}

export async function editarCliente(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaEditar.safeParse({
    id: formData.get('id'),
    ...lerCampos(formData),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const { id, ...dados } = parsed.data
  const admin = createAdminClient()

  const { data: atual } = await admin
    .from('clientes').select('email').eq('id', id).single()

  if (!atual) return { ok: false, erro: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('clientes')
    .update({
      razao_social: dados.razao_social,
      cnpj: dados.cnpj,
      email: dados.email,
      contato: dados.contato || null,
      telefone: dados.telefone || null,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Já existe outro cliente com este CNPJ.' }
    }
    return { ok: false, erro: 'Não foi possível salvar as alterações.' }
  }

  // Se o e-mail mudou, atualiza também o login
  if (atual.email !== dados.email) {
    const { data: perfil } = await admin
      .from('profiles').select('id').eq('cliente_id', id).single()

    if (perfil) {
      const { error: erroAuth } = await admin.auth.admin.updateUserById(
        perfil.id,
        { email: dados.email, email_confirm: true }
      )
      if (erroAuth) {
        return {
          ok: false,
          erro: 'Dados salvos, mas o e-mail de acesso não pôde ser alterado. Ele já pode estar em uso.',
        }
      }
    }
  }

  revalidatePath('/admin/clientes')
  return { ok: true }
}

export async function alternarClienteAtivo(
  clienteId: string,
  ativo: boolean
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('clientes').update({ ativo }).eq('id', clienteId)

  if (error) return { ok: false, erro: 'Não foi possível alterar o status.' }

  // Bloqueia o login junto
  await admin.from('profiles').update({ ativo }).eq('cliente_id', clienteId)

  revalidatePath('/admin/clientes')
  return { ok: true }
}

export async function redefinirSenha(
  clienteId: string
): Promise<{ ok: true; senha: string } | { ok: false; erro: string }> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('id').eq('cliente_id', clienteId).single()

  if (!perfil) return { ok: false, erro: 'Acesso não encontrado.' }

  const senha = gerarSenha()

  const { error } = await admin.auth.admin.updateUserById(perfil.id, {
    password: senha,
  })

  if (error) return { ok: false, erro: 'Não foi possível redefinir a senha.' }

  return { ok: true, senha }
}

function gerarSenha(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}