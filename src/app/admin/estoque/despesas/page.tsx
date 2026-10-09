import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import BuscaPagina from '@/components/busca-pagina'
import AbasEstoque from '../abas-estoque'
import { listarDespesas } from '@/app/actions/despesas'
import FiltrosDespesas from './filtros-despesas'
import ListaDespesas from './lista-despesas'
import { hojeBrasilia } from '@/lib/datas'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function inicioDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const hoje = () => hojeBrasilia()

/**
 * Despesas por documento: controle de gastos por tipo. Só quem vê valores.
 */
export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; categoria?: string }>
}) {
  const perfil = await lerPerfil()
  if (!perfil || !perfil.veValores) redirect('/admin/estoque')
  const { de, ate, categoria } = await searchParams
  const dataDe = de ?? inicioDoMes()
  const dataAte = ate ?? hoje()

  const supabase = await createClient()
  const [resumo, { data: categorias }] = await Promise.all([
    listarDespesas({ de: dataDe, ate: dataAte, categoriaId: categoria || undefined }),
    supabase.from('categorias_despesa').select('id, nome').eq('ativo', true).order('nome'),
  ])
  if (!resumo) redirect('/admin/estoque')

  const ia = resumo.linhas.filter((l) => l.modo === 'ia').length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">Estoque</h1>
        <BuscaPagina placeholder="Filtrar por fornecedor ou item..." rotulo="Filtrar esta página" />
      </div>
      <AbasEstoque dono />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <p className="text-sm text-[#6E6E68] leading-relaxed max-w-xl">
          Notas, cupons e recibos de compras e despesas. Tire a foto ou anexe o arquivo: a IA
          pré-preenche, você confere e salva. Item marcado como suprimento entra no estoque.
        </p>
        <Link href="/admin/estoque/despesas/nova" className="shrink-0 bg-[#D8007A] text-white rounded-sm px-4 py-2.5 text-xs font-bold tracking-wide">
          + NOVA NOTA
        </Link>
      </div>

      <FiltrosDespesas de={dataDe} ate={dataAte} categoriaId={categoria} categorias={(categorias ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }))} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <Cartao rotulo="GASTO NO PERÍODO" valor={`R$ ${brl(resumo.total)}`} />
        <Cartao rotulo="DOCUMENTOS" valor={String(resumo.documentos)} />
        <Cartao rotulo="CATEGORIAS" valor={String(resumo.porCategoria.length)} />
        <Cartao rotulo="LIDOS POR IA" valor={`${ia} de ${resumo.documentos}`} />
      </div>

      <ListaDespesas resumo={resumo} />
    </div>
  )
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-3">
      <div className="text-[9px] tracking-[0.14em] text-[#6E6E68]">{rotulo}</div>
      <div className="font-mono font-bold text-base sm:text-lg mt-1 text-[#131A2E]">{valor}</div>
    </div>
  )
}
