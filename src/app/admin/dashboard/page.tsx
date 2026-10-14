import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import Avisos, { type Aviso } from './avisos'
import { PRAZO_COMPROVANTE_DIAS } from '@/lib/contas-pagar/condicoes'
import { hojeBrasilia } from '@/lib/datas'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Dashboard do dono e do financeiro. Por ora só os avisos do que já existe
 * (contas a pagar, notas sem comprovante, insumos no mínimo). Resultado por
 * canal e estoque por local entram com os módulos de pedidos e estoque.
 */
export default async function DashboardPage() {
  const perfil = await lerPerfil()

  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) redirect('/admin')

  const supabase = await createClient()
  const agora = new Date()
  // Contas a pagar vencidas, pela data de hoje em Brasília
  const hojeBr = hojeBrasilia(agora)
  // Notas lançadas sem foto/PDF há mais do prazo: aviso vermelho até anexarem
  const limiteComprovante = new Date(agora.getTime() - PRAZO_COMPROVANTE_DIAS * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: contasVencidas }, { data: notasSemArquivo }, { data: insumos }, { data: saldos }] = await Promise.all([
    supabase
      .from('contas_pagar')
      .select('valor')
      .is('pago_em', null)
      .is('cancelada_em', null)
      .lt('vencimento', hojeBr),
    supabase
      .from('despesas')
      .select('total')
      .is('arquivo_path', null)
      .is('excluido_em', null)
      .not('condicao_pagamento', 'is', null)
      .lt('criado_em', limiteComprovante),
    supabase.from('suprimentos').select('id, nome, minimo').eq('ativo', true).gt('minimo', 0),
    supabase.from('suprimento_saldos').select('suprimento_id, saldo'),
  ])

  const semComprovante = (notasSemArquivo ?? []) as { total: number | string }[]
  const valorSemComprovante = semComprovante.reduce((s, d) => s + Number(d.total), 0)
  const vencidasPagar = (contasVencidas ?? []) as { valor: number | string }[]
  const valorVencidasPagar = vencidasPagar.reduce((s, c) => s + Number(c.valor), 0)
  const saldoDe = new Map(((saldos ?? []) as { suprimento_id: string; saldo: number | string }[]).map((s) => [s.suprimento_id, Number(s.saldo)]))
  const noMinimo = ((insumos ?? []) as { id: string; nome: string; minimo: number | string }[]).filter(
    (i) => (saldoDe.get(i.id) ?? 0) <= Number(i.minimo)
  )

  const s = (n: number, um: string, varios: string) => (n === 1 ? um : varios)
  const avisos: Aviso[] = []
  if (semComprovante.length)
    avisos.push({
      nivel: 'urgente',
      titulo: `${semComprovante.length} ${s(semComprovante.length, 'nota', 'notas')} de compra sem comprovante há mais de ${PRAZO_COMPROVANTE_DIAS} dias`,
      detalhe: `R$ ${brl(valorSemComprovante)} em contas a pagar sem nota fiscal ou recibo · toque para anexar`,
      href: '/admin/financeiro/a-pagar?situacao=todas&comprovante=pendente',
    })
  if (vencidasPagar.length)
    avisos.push({
      nivel: 'urgente',
      titulo: `${vencidasPagar.length} ${s(vencidasPagar.length, 'conta a pagar vencida', 'contas a pagar vencidas')}`,
      detalhe: `R$ ${brl(valorVencidasPagar)} · registre o pagamento ou ajuste o vencimento`,
      href: '/admin/financeiro/a-pagar',
    })
  if (noMinimo.length)
    avisos.push({
      nivel: 'atencao',
      titulo: `${noMinimo.length} ${s(noMinimo.length, 'insumo no mínimo', 'insumos no mínimo')}`,
      detalhe: noMinimo.map((i) => i.nome).join(' · '),
      href: '/admin/estoque/suprimentos',
    })

  return (
    <div>
      {/* Título e atalho na mesma linha: o botão não gasta uma faixa só para ele */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">Dashboard</h1>
        </div>
        {/* Conta a pagar só nasce da nota: o atalho é o lançamento da nota */}
        <Link
          href="/admin/estoque/despesas/nova"
          className="shrink-0 inline-flex items-center gap-1.5 bg-[#131A2E] text-white rounded-sm px-3 py-2 text-xs font-semibold tracking-wide"
          title="Lançar nota de compra"
        >
          📷 <span className="hidden sm:inline">LANÇAR </span>NOTA
        </Link>
      </div>

      <Avisos avisos={avisos} />

      {avisos.length === 0 && (
        <p className="text-sm text-[#6E6E68] mb-5">Nenhuma pendência no momento.</p>
      )}

      <div className="border border-dashed border-[#DDDCD5] rounded-sm py-10 px-5 text-center">
        <p className="text-sm text-[#6E6E68] leading-relaxed">
          Resultado por canal e estoque por local aparecem aqui quando entrarem os módulos de
          produtos, estoque e pedidos dos marketplaces.
        </p>
      </div>
    </div>
  )
}
