'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { registrar, type CampoAlterado } from '@/lib/auditoria'
import {
  TIPOS,
  ROTULOS,
  PADRAO as PADRAO_NOTIFICACOES,
  normalizar as normalizarNotificacoes,
  type ConfigNotificacoes,
} from '@/lib/notificacoes/config'

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && (perfil.role === 'admin' || perfil.role === 'financeiro')
}

/* --------------------------- avisos para a equipe --------------------------- */

export async function buscarConfigNotificacoes(): Promise<ConfigNotificacoes> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'notificacoes')
    .maybeSingle()

  if (!data?.valor) return PADRAO_NOTIFICACOES

  try {
    return normalizarNotificacoes(JSON.parse(data.valor))
  } catch {
    return PADRAO_NOTIFICACOES
  }
}

export async function atualizarConfigNotificacoes(
  nova: ConfigNotificacoes
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object(
      Object.fromEntries(
        TIPOS.map((tipo) => [tipo, z.array(z.string().email()).max(20)])
      ) as Record<(typeof TIPOS)[number], z.ZodArray<z.ZodString>>
    )
    .safeParse(nova)

  if (!parsed.success) {
    return { ok: false, erro: 'Há um e-mail inválido na lista.' }
  }

  const limpa = normalizarNotificacoes(parsed.data)
  const antes = await buscarConfigNotificacoes()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('configuracoes')
    .upsert(
      {
        chave: 'notificacoes',
        valor: JSON.stringify(limpa),
        atualizado_em: new Date().toISOString(),
        atualizado_por: user?.id,
      },
      { onConflict: 'chave' }
    )

  if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message }

  // Cada tipo vira uma linha na auditoria, com a lista antes e depois
  const campos: CampoAlterado[] = []
  for (const tipo of TIPOS) {
    const de = antes[tipo].join(', ')
    const para = limpa[tipo].join(', ')
    if (de !== para) {
      campos.push({ campo: `Aviso · ${ROTULOS[tipo].titulo}`, de: de || null, para: para || null })
    }
  }

  await registrar({
    entidade: 'configuracao',
    entidadeId: null,
    acao: 'editou',
    campos,
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}
