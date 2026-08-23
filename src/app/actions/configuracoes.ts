'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && (perfil.role === 'admin' || perfil.role === 'financeiro')
}

export async function buscarValorMinimoBoleto(): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'valor_minimo_boleto')
    .single()

  return data ? Number(data.valor) : 200
}

export async function atualizarValorMinimoBoleto(novoValor: number): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.number().positive('Valor deve ser maior que zero').safeParse(novoValor)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('configuracoes')
    .update({
      valor: parsed.data.toFixed(2),
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id,
    })
    .eq('chave', 'valor_minimo_boleto')

  if (error) return { ok: false, erro: 'Não foi possível salvar.' }

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}

export async function buscarMaxParcelas(): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'max_parcelas')
    .single()

  return data ? Number(data.valor) : 3
}

export async function atualizarMaxParcelas(novoValor: number): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.number().int().min(2, 'Mínimo de 2 parcelas').max(24, 'Máximo de 24 parcelas').safeParse(novoValor)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('configuracoes')
    .update({
      valor: String(parsed.data),
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id,
    })
    .eq('chave', 'max_parcelas')

  if (error) return { ok: false, erro: 'Não foi possível salvar.' }

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}