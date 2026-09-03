'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Custos } from '@/lib/custos/calculo'

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirFinanceiro() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return (
    !!perfil && perfil.ativo &&
    (perfil.role === 'admin' || perfil.role === 'financeiro')
  )
}

export async function buscarCustos(): Promise<Custos> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('custos_producao')
    .select('papel_por_metro, tinta_por_litro, consumo_ml_por_metro, atualizado_em')
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    papelPorMetro: data ? Number(data.papel_por_metro) : 0,
    tintaPorLitro: data ? Number(data.tinta_por_litro) : 0,
    consumoMlPorMetro: data ? Number(data.consumo_ml_por_metro) : 0,
    atualizadoEm: data?.atualizado_em ?? null,
  }
}

export async function atualizarCustos(dados: {
  papelPorMetro: number
  tintaPorLitro: number
  consumoMlPorMetro: number
}): Promise<Resultado> {
  if (!(await exigirFinanceiro())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.object({
    papelPorMetro: z.number().min(0, 'Custo do papel inválido').max(100000),
    tintaPorLitro: z.number().min(0, 'Custo da tinta inválido').max(100000),
    consumoMlPorMetro: z.number().min(0, 'Consumo inválido').max(100000),
  }).safeParse(dados)

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('atualizar_custos_producao', {
    p_papel_por_metro: parsed.data.papelPorMetro,
    p_tinta_por_litro: parsed.data.tintaPorLitro,
    p_consumo_ml_por_metro: parsed.data.consumoMlPorMetro,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/admin/financeiro/custos')
  revalidatePath('/admin/financeiro/apuracao')
  return { ok: true }
}

export type LinhaApuracao = {
  pedidoId: string
  numero: number
  cliente: string
  metragem: number
  receita: number
  custo: number
  lucro: number
  data: string
}

/**
 * Apuração do período. Usa o custo congelado em cada pedido no momento do
 * romaneio — atualizar os custos hoje não altera o lucro de pedidos antigos.
 */
export async function apurarPeriodo(
  de: string,
  ate: string
): Promise<LinhaApuracao[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, metragem_impressa, romaneio_gerado_em,
      custo_papel_por_metro, custo_tinta_por_metro,
      clientes(razao_social)
    `)
    .not('metragem_impressa', 'is', null)
    .is('cancelado_em', null)
    .gte('romaneio_gerado_em', `${de}T00:00:00`)
    .lte('romaneio_gerado_em', `${ate}T23:59:59`)
    .order('romaneio_gerado_em', { ascending: false })

  return ((data ?? []) as any[]).map((p) => {
    const metragem = Number(p.metragem_impressa)
    const receita = Number(p.total)
    const custoMetro =
      Number(p.custo_papel_por_metro ?? 0) + Number(p.custo_tinta_por_metro ?? 0)
    const custo = Math.round(metragem * custoMetro * 100) / 100

    return {
      pedidoId: p.id,
      numero: Number(p.numero),
      cliente: p.clientes?.razao_social ?? '—',
      metragem,
      receita,
      custo,
      lucro: Math.round((receita - custo) * 100) / 100,
      data: p.romaneio_gerado_em,
    }
  })
}
