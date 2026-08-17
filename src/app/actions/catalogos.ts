'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const camposBase = {
  cliente_id: z.string().uuid('Selecione um cliente'),
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).optional(),
}

const schemaCriar = z.object(camposBase)
const schemaEditar = z.object({
  id: z.string().uuid(),
  nome: camposBase.nome,
  descricao: camposBase.descricao,
})

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && perfil.role === 'admin'
}

export async function criarCatalogo(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaCriar.safeParse({
    cliente_id: formData.get('cliente_id'),
    nome: formData.get('nome'),
    descricao: formData.get('descricao') || undefined,
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const admin = createAdminClient()

  // Confere que o cliente existe e está ativo
  const { data: cliente } = await admin
    .from('clientes').select('id, ativo').eq('id', parsed.data.cliente_id).single()

  if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' }
  if (!cliente.ativo) return { ok: false, erro: 'Cliente está inativo.' }

  const { error } = await admin.from('catalogos').insert({
    cliente_id: parsed.data.cliente_id,
    nome: parsed.data.nome,
    descricao: parsed.data.descricao || null,
  })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Este cliente já tem um catálogo com esse nome.' }
    }
    return { ok: false, erro: 'Não foi possível criar o catálogo.' }
  }

  revalidatePath('/admin/catalogo')
  return { ok: true }
}

export async function editarCatalogo(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaEditar.safeParse({
    id: formData.get('id'),
    nome: formData.get('nome'),
    descricao: formData.get('descricao') || undefined,
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('catalogos')
    .update({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
    })
    .eq('id', parsed.data.id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Este cliente já tem um catálogo com esse nome.' }
    }
    return { ok: false, erro: 'Não foi possível salvar.' }
  }

  revalidatePath('/admin/catalogo')
  return { ok: true }
}

export async function alternarCatalogoAtivo(
  catalogoId: string,
  ativo: boolean
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('catalogos').update({ ativo }).eq('id', catalogoId)

  if (error) return { ok: false, erro: 'Não foi possível alterar o status.' }

  revalidatePath('/admin/catalogo')
  return { ok: true }
}