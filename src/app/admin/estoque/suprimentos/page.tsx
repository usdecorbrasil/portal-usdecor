import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import BuscaPagina from '@/components/busca-pagina'
import AbasEstoque from '../abas-estoque'
import ListaSuprimentos, { type SuprimentoLinha, type MovimentoSuprimento } from './lista-suprimentos'

/**
 * Insumos: zíper, linha, etiqueta, embalagem. A produção vê saldos e lança
 * consumo; o dono cadastra e define o mínimo. Entrada vem da nota, em
 * Despesas. (A tabela continua `suprimentos` no banco.)
 */
export default async function SuprimentosPage() {
  const perfil = await lerPerfil()
  if (!perfil) redirect('/')
  const dono = perfil.veValores
  const supabase = await createClient()

  const [{ data: suprimentos }, { data: saldos }, { data: categorias }, { data: movimentos }] = await Promise.all([
    supabase.from('suprimentos').select('id, nome, unidade, minimo, ativo, categoria_id, categorias_despesa(nome)').order('nome'),
    supabase.from('suprimento_saldos').select('suprimento_id, saldo, ultimo_movimento'),
    supabase.from('categorias_despesa').select('id, nome').eq('ativo', true).order('nome'),
    // Custo só para quem vê valores: a produção lê a view sem a coluna de
    // custo (a tabela de movimentos é só de admin/financeiro no banco)
    dono
      ? supabase
          .from('suprimento_movimentos')
          .select('id, suprimento_id, tipo, quantidade, custo_total, observacao, criado_em')
          .order('criado_em', { ascending: false })
          .limit(100)
      : supabase
          .from('suprimento_movimentos_producao')
          .select('id, suprimento_id, tipo, quantidade, observacao, criado_em')
          .order('criado_em', { ascending: false })
          .limit(100),
  ])

  const saldoDe = new Map(((saldos ?? []) as any[]).map((s) => [s.suprimento_id, s]))
  const linhas: SuprimentoLinha[] = ((suprimentos ?? []) as any[]).map((s) => ({
    id: s.id,
    nome: s.nome,
    unidade: s.unidade,
    minimo: Number(s.minimo ?? 0),
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
    data: m.criado_em,
  }))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">Estoque</h1>
        <BuscaPagina placeholder="Filtrar insumo..." rotulo="Filtrar esta página" />
      </div>
      <AbasEstoque dono={dono} />
      <p className="text-sm text-[#6E6E68] mt-1 mb-5 leading-relaxed">
        Zíper, linha, etiqueta, embalagem e o que mais a produção das capas consome. A entrada
        vem da nota de compra (Despesas e notas); o consumo e os ajustes são lançados aqui.
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
