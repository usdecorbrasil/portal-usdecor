'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

/** Move uma arte para outra coleção do mesmo cliente */
export async function moverColecao(
  produtoId: string,
  catalogoId: string
): Promise<Resultado> {
  const parsed = z.object({
    produtoId: z.string().uuid(),
    catalogoId: z.string().uuid(),
  }).safeParse({ produtoId, catalogoId })

  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' }

  const supabase = await createClient()

  const { error } = await supabase.rpc('mover_arte_colecao', {
    p_produto_id: parsed.data.produtoId,
    p_catalogo_id: parsed.data.catalogoId,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/admin/catalogo')
  revalidatePath('/catalogo')
  return { ok: true }
}

/** Renomeia a coleção — equipe interna e o cliente dono */
export async function renomearColecao(
  catalogoId: string,
  nome: string,
  descricao?: string
): Promise<Resultado> {
  const parsed = z.object({
    catalogoId: z.string().uuid(),
    nome: z.string().trim().min(1, 'O nome não pode ficar vazio').max(120),
    descricao: z.string().trim().max(500).optional(),
  }).safeParse({ catalogoId, nome, descricao })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('renomear_colecao', {
    p_catalogo_id: parsed.data.catalogoId,
    p_nome: parsed.data.nome,
    p_descricao: parsed.data.descricao || null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/admin/catalogo')
  revalidatePath('/catalogo')
  return { ok: true }
}