import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sugerirCustos, type EntradaCompra, type SugestaoCustos } from './sugestao'

/**
 * Lê as entradas de estoque com custo (notas de compra) do período e monta a
 * sugestão de custos. Usada pela aba Custos (mostrar) e pelo lançamento de
 * nota (aplicar sozinho, quando a opção está ligada).
 */

export type ConfigCustosAutomaticos = { ativo: boolean; janelaDias: 30 | 60 | 90 }
export const PADRAO_CUSTOS_AUTOMATICOS: ConfigCustosAutomaticos = { ativo: false, janelaDias: 30 }

export async function lerConfigCustosAutomaticos(supabase: SupabaseClient): Promise<ConfigCustosAutomaticos> {
  const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'custos_automaticos').maybeSingle()
  if (!data?.valor) return PADRAO_CUSTOS_AUTOMATICOS
  try {
    const v = JSON.parse(data.valor)
    const janela = [30, 60, 90].includes(Number(v.janelaDias)) ? (Number(v.janelaDias) as 30 | 60 | 90) : 30
    return { ativo: v.ativo === true, janelaDias: janela }
  } catch {
    return PADRAO_CUSTOS_AUTOMATICOS
  }
}

export async function carregarSugestaoCustos(supabase: SupabaseClient, janelaDias: number): Promise<SugestaoCustos> {
  const de = new Date()
  de.setDate(de.getDate() - janelaDias)
  const deIso = de.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('suprimento_movimentos')
    .select('quantidade, custo_total, criado_em, suprimentos(nome, unidade, consumo_por_metro, categorias_despesa(nome))')
    .eq('tipo', 'entrada')
    .not('custo_total', 'is', null)
    .gte('criado_em', `${deIso}T00:00:00`)

  type Linha = {
    quantidade: number | string
    custo_total: number | string
    criado_em: string
    suprimentos: {
      nome: string
      unidade: string | null
      consumo_por_metro: number | string | null
      categorias_despesa: { nome: string } | null
    } | null
  }
  const entradas: EntradaCompra[] = ((data ?? []) as unknown as Linha[])
    .filter((m) => m.suprimentos)
    .map((m) => ({
      suprimento: String(m.suprimentos!.nome),
      categoria: m.suprimentos!.categorias_despesa?.nome ?? null,
      unidade: String(m.suprimentos!.unidade ?? ''),
      quantidade: Number(m.quantidade),
      custoTotal: Number(m.custo_total),
      data: String(m.criado_em).slice(0, 10),
      consumoPorMetro: m.suprimentos!.consumo_por_metro != null ? Number(m.suprimentos!.consumo_por_metro) : null,
    }))

  return sugerirCustos(entradas, janelaDias, deIso)
}

/**
 * Com "atualizar sozinho" ligado, recalcula a sugestão e grava os custos:
 * papel por metro e tinta por litro vêm das compras; o coeficiente de tinta
 * só muda se alguma tinta tiver consumo cadastrado; calandra não muda.
 * Nunca lança: falha aqui não pode derrubar o lançamento da nota.
 */
export async function aplicarCustosAutomaticos(supabase: SupabaseClient): Promise<string | null> {
  try {
    const cfg = await lerConfigCustosAutomaticos(supabase)
    if (!cfg.ativo) return null
    const s = await carregarSugestaoCustos(supabase, cfg.janelaDias)
    if (!s.papel && !s.tinta) return null

    const { data: atual } = await supabase
      .from('custos_producao')
      .select('papel_por_metro, tinta_por_litro, consumo_ml_por_metro, calandra_por_metro')
      .order('atualizado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    const novo = {
      p_papel_por_metro: s.papel ? s.papel.porMetroImpresso : Number(atual?.papel_por_metro ?? 0),
      p_tinta_por_litro: s.tinta ? s.tinta.custoMedioLitro : Number(atual?.tinta_por_litro ?? 0),
      p_consumo_ml_por_metro: s.tinta?.consumoMlPorMetro ?? Number(atual?.consumo_ml_por_metro ?? 0),
      p_calandra_por_metro: Number(atual?.calandra_por_metro ?? 0),
    }
    const mudou =
      !atual ||
      Number(atual.papel_por_metro) !== novo.p_papel_por_metro ||
      Number(atual.tinta_por_litro) !== novo.p_tinta_por_litro ||
      Number(atual.consumo_ml_por_metro) !== novo.p_consumo_ml_por_metro
    if (!mudou) return null

    const { error } = await supabase.rpc('atualizar_custos_producao', novo)
    if (error) {
      console.error('[custos automáticos]', error.message)
      return null
    }
    return `Custos atualizados pelas compras: papel R$ ${novo.p_papel_por_metro.toFixed(2)}/m, tinta R$ ${novo.p_tinta_por_litro.toFixed(2)}/L.`
  } catch (e) {
    console.error('[custos automáticos]', e)
    return null
  }
}
