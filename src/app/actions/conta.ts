'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

/** Cliente atualiza apenas os próprios dados operacionais de contato */
export async function atualizarMeuContato(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  const parsed = z.object({
    contato: z.string().trim().max(120).optional(),
    telefone: z.string().trim().max(40).optional(),
  }).safeParse({
    contato: formData.get('contato') || undefined,
    telefone: formData.get('telefone') || undefined,
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('cliente_atualizar_contato', {
    p_contato: parsed.data.contato ?? null,
    p_telefone: parsed.data.telefone ?? null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/conta')
  return { ok: true }
}
