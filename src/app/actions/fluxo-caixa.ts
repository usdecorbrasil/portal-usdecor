'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { buscarAguardandoRecebimento } from './clientes'
import { hojeBrasilia, somarDias } from '@/lib/datas'

/**
 * Totalizador do Financeiro: o que entra (cobranças dos pedidos) e o que sai
 * (contas a pagar) num período, mais o que já venceu. Só admin/financeiro —
 * é valor monetário.
 */

export type Totais = { qtd: number; valor: number }

export type ResumoFluxo = {
  de: string
  ate: string
  hoje: string
  aReceber: {
    /** Vence dentro do período. */
    periodo: Totais
    /** Já venceu e não foi pago (fora do período, vem sempre). */
    vencidas: Totais
    /** Pedidos em cobrança ainda sem vencimento definido (boleto a emitir). */
    semVencimento: Totais
  }
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
  const [parcelas, contas] = await Promise.all([
    buscarAguardandoRecebimento(),
    supabase.from('contas_pagar').select('valor, vencimento').is('pago_em', null).is('cancelada_em', null).lte('vencimento', fim),
  ])

  const receber = parcelas.filter((p) => !p.pagoEm)
  const pagar = ((contas.data ?? []) as { valor: number | string; vencimento: string }[]).map((c) => ({ valor: Number(c.valor), vencimento: c.vencimento }))

  return {
    de: ini,
    ate: fim,
    hoje,
    aReceber: {
      periodo: somar(receber.filter((p) => p.vencimento && p.vencimento >= ini && p.vencimento <= fim && !(p.vencimento < hoje))),
      vencidas: somar(receber.filter((p) => p.vencimento && p.vencimento < hoje)),
      semVencimento: somar(receber.filter((p) => !p.vencimento)),
    },
    aPagar: {
      periodo: somar(pagar.filter((c) => c.vencimento >= ini && c.vencimento <= fim && c.vencimento >= hoje)),
      vencidas: somar(pagar.filter((c) => c.vencimento < hoje)),
    },
  }
}
