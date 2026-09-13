'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  normalizar,
  PADRAO,
  type ConfigPagamento,
} from '@/lib/pagamento/config'

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
/* ------------------------- formas de pagamento ------------------------- */

/**
 * Todas as regras de pagamento vivem numa chave só, em JSON. São cinco
 * ajustes por forma; em linhas chave/valor separadas, cada leitura da tela
 * viraria uma consulta diferente.
 */
export async function buscarConfigPagamento(): Promise<ConfigPagamento> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'formas_pagamento')
    .maybeSingle()

  if (!data?.valor) return PADRAO

  try {
    return normalizar(JSON.parse(data.valor))
  } catch {
    // JSON corrompido não pode derrubar o carrinho
    return PADRAO
  }
}

const schemaForma = z.object({
  ativa: z.boolean(),
  maxParcelas: z.number().int().min(1, 'Mínimo de 1 parcela').max(24, 'Máximo de 24 parcelas'),
  valorMinimoParcela: z.number().min(0, 'Não pode ser negativo').max(100000),
  percentual: z.number().min(0, 'Não pode ser negativo').max(100, 'Máximo de 100%'),
  taxaFixa: z.number().min(0, 'Não pode ser negativo').max(10000),
  intervaloDias: z.number().int().min(1).max(90),
})

export async function atualizarConfigPagamento(
  nova: ConfigPagamento
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({
      boleto: schemaForma,
      cartao_credito: schemaForma,
      cartao_debito: schemaForma,
    })
    .safeParse(nova)

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  if (!Object.values(parsed.data).some((f) => f.ativa)) {
    return { ok: false, erro: 'Deixe ao menos uma forma de pagamento ativa.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // upsert porque esta chave pode ainda não existir na tabela
  const { error } = await supabase.from('configuracoes').upsert(
    {
      chave: 'formas_pagamento',
      valor: JSON.stringify(normalizar(parsed.data)),
      descricao: 'Formas de pagamento aceitas, parcelamento e taxas',
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id,
    },
    { onConflict: 'chave' }
  )

  if (error) return { ok: false, erro: 'Não foi possível salvar.' }

  revalidatePath('/admin/configuracoes')
  revalidatePath('/carrinho')
  return { ok: true }
}
