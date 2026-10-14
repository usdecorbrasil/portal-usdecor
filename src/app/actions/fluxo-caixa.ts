'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { hojeBrasilia, somarDias } from '@/lib/datas'

/**
 * Totalizador do Financeiro: o que sai (contas a pagar) num período, mais o
 * que já venceu. O lado do que entra volta com os repasses dos marketplaces. Só admin/financeiro —
 * é valor monetário.
 */

export type Totais = { qtd: number; valor: number }

export type ResumoFluxo = {
  de: string
  ate: string
  hoje: string
  aPagar: {
    periodo: Totais
    vencidas: Totais
  }
}

const somar = (xs: { valor: number }[]): Totais => ({
  qtd: xs.length,
  valor: Math.round(xs.reduce((s, x) => s + x.valor, 0) * 100) / 100,
})

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export async function resumoFluxoCaixa(de: string, ate: string): Promise<ResumoFluxo | null> {
  const perfil = await lerPerfil()
  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) return null
  const hoje = hojeBrasilia()
  const ini = data.safeParse(de).success ? de : hoje
  const fim = data.safeParse(ate).success && ate >= ini ? ate : somarDias(ini, 7)

  const supabase = await createClient()
  const contas = await supabase.from('contas_pagar').select('valor, vencimento').is('pago_em', null).is('cancelada_em', null).lte('vencimento', fim)

  const pagar = ((contas.data ?? []) as { valor: number | string; vencimento: string }[]).map((c) => ({ valor: Number(c.valor), vencimento: c.vencimento }))

  return {
    de: ini,
    ate: fim,
    hoje,
    aPagar: {
      periodo: somar(pagar.filter((c) => c.vencimento >= ini && c.vencimento <= fim && c.vencimento >= hoje)),
      vencidas: somar(pagar.filter((c) => c.vencimento < hoje)),
    },
  }
}
