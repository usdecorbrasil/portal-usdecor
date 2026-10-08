import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import BuscaPagina from '@/components/busca-pagina'
import AbasEstoque from '../abas-estoque'
import ListaSuprimentos, { type SuprimentoLinha, type MovimentoSuprimento } from './lista-suprimentos'

/**
 * Suprimentos da estamparia: tinta, papel, embalagem. A produção vê saldos e
 * lança consumo; o dono cadastra, define mínimo e o consumo automático por
 * metro estampado. Entrada vem da nota, em Despesas.
 */
export default async function SuprimentosPage() {
  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') redirect('/')
  const dono = perfil.veValores
  const supabase = await createClient()

  const [{ data: suprimentos }, { data: saldos }, { data: categorias }, { data: movimentos }] = await Promise.all([
    supabase.from('suprimentos').select('id, nome, unidade, minimo, consumo_por_metro, ativo, categoria_id, categorias_despesa(nome)').order('nome'),
    supabase.from('suprimento_saldos').select('suprimento_id, saldo, ultimo_movimento'),
    supabase.from('categorias_despesa').select('id, nome').eq('ativo', true).order('nome'),
    supabase
      .from('suprimento_movimentos')
      .select('id, suprimento_id, tipo, quantidade, custo_total, observacao, criado_em, pedidos(numero)')
      .order('criado_em', { ascending: false })
      .limit(100),
  ])

  const saldoDe = new Map(((saldos ?? []) as any[]).map((s) => [s.suprimento_id, s]))
  const linhas: SuprimentoLinha[] = ((suprimentos ?? []) as any[]).map((s) => ({
    id: s.id,
    nome: s.nome,
    unidade: s.unidade,
    minimo: Number(s.minimo ?? 0),
    consumoPorMetro: s.consumo_por_metro != null ? Number(s.consumo_por_metro) : null,
    ativo: !!s.ativo,
    categoriaId: s.categoria_id ?? null,
    categoria: s.categorias_despesa?.nome ?? null,
    saldo: Number(saldoDe.get(s.id)?.saldo ?? 0),
    ultimo: saldoDe.get(s.id)?.ultimo_movimento ?? null,
  }))

  const nome = new Map(linhas.map((l) => [l.id, l]))
  const movs: MovimentoSuprimento[] = ((movimentos ?? []) as any[]).map((m) => ({
    id: m.id,
    suprimento: nome.get(m.suprimento_id)?.nome ?? '—',
    unidade: nome.get(m.suprimento_id)?.unidade ?? '',
    tipo: m.tipo,
    quantidade: Number(m.quantidade),
    custoTotal: dono && m.custo_total != null ? Number(m.custo_total) : null,
    observacao: m.observacao ?? null,
    pedidoNumero: m.pedidos?.numero != null ? Number(m.pedidos.numero) : null,
    data: m.criado_em,
  }))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">Estoque</h1>
        <BuscaPagina placeholder="Filtrar suprimento..." rotulo="Filtrar esta página" />
      </div>
      <AbasEstoque dono={dono} />
      <p className="text-sm text-[#6E6E68] mt-1 mb-5 leading-relaxed">
        Tinta, papel, embalagem e o que mais a estamparia consome. A entrada vem da nota de
        compra (Despesas e notas); o consumo é lançado aqui ou baixado sozinho pelo romaneio,
        quando o suprimento tem consumo por metro definido.
      </p>

      <ListaSuprimentos
        linhas={linhas}
        movimentos={movs}
        categorias={(categorias ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }))}
        dono={dono}
      />
    </div>
  )
}
