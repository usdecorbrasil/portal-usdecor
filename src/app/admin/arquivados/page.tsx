import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FiltroData from '../pedidos/filtro-data'
import FiltrosRecolhiveis from '@/components/filtros-recolhiveis'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ATIVOS = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'corte_costura',
  'pronto', 'nf_emitida', 'expedido', 'entregue', 'fechado',
]

export default async function ArquivadosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const { de: dataDe, ate: dataAte } = await searchParams
  const supabase = await createClient()

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, created_at, cancelado_em, cancelado_motivo,
      metragem_impressa,
      clientes(razao_social),
      pedido_itens(quantidade_faturada),
      pedido_status_historico(status, created_at)
    `)
    .order('created_at', { ascending: false })

  let lista = (pedidos ?? [])
    .map((p) => {
      const hist = (p.pedido_status_historico ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      const status = hist[0]?.status ?? 'recebido'
      const liberadoMetragem = ATIVOS.indexOf(status) >= ATIVOS.indexOf('estampando')

      return {
        id: p.id,
        numero: p.numero,
        total: Number(p.total),
        metragemImpressa: p.metragem_impressa ? Number(p.metragem_impressa) : null,
        liberadoMetragem,
        unidades: (p.pedido_itens ?? []).reduce(
          (a: number, i: any) => a + Number(i.quantidade_faturada),
          0
        ),
        cliente:
          (p.clientes as unknown as { razao_social: string } | null)
            ?.razao_social ?? '—',
        status,
        cancelado: !!p.cancelado_em,
        motivo: p.cancelado_motivo,
        criado: p.created_at,
        encerrado: p.cancelado_em ?? hist[0]?.created_at ?? p.created_at,
      }
    })
    .filter((p) => p.cancelado || p.status === 'fechado')

  if (dataDe) {
    const inicio = new Date(dataDe + 'T00:00:00')
    lista = lista.filter((p) => new Date(p.encerrado) >= inicio)
  }
  if (dataAte) {
    const fim = new Date(dataAte + 'T23:59:59')
    lista = lista.filter((p) => new Date(p.encerrado) <= fim)
  }

  const fechados = lista.filter((p) => !p.cancelado)
  const cancelados = lista.filter((p) => p.cancelado)
  const faturado = fechados.reduce((a, p) => a + p.total, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Pedidos arquivados
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-4">
        {fechados.length} fechado{fechados.length === 1 ? '' : 's'} ·{' '}
        {cancelados.length} cancelado{cancelados.length === 1 ? '' : 's'}
      </p>

      <FiltrosRecolhiveis temFiltroAtivo={!!dataDe || !!dataAte}>
        <FiltroData
          rota="/admin/arquivados"
          deAtual={dataDe}
          ateAtual={dataAte}
        />
      </FiltrosRecolhiveis>

      {fechados.length > 0 && (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mb-6 flex items-baseline justify-between gap-3">
          <span className="text-xs tracking-widest text-[#6E6E68]">
            TOTAL FATURADO
          </span>
          <strong className="font-mono text-xl">R$ {brl(faturado)}</strong>
        </div>
      )}

      <div className="space-y-2 sm:space-y-3">
        {lista.map((p) => (
          <Link
            key={p.id}
            href={`/admin/pedidos/${p.id}`}
            className="block bg-white border border-[#DDDCD5] rounded-sm p-3 sm:p-4 hover:border-[#131A2E]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs sm:text-sm text-[#6E6E68] whitespace-nowrap">
                  #{p.numero}
                </div>
                <span className="font-semibold tracking-tight text-base sm:text-lg truncate block">
                  {p.cliente}
                </span>
              </div>

              <div
                className={`text-right shrink-0 text-xs sm:text-sm font-mono ${
                  p.cancelado ? 'text-[#6E6E68] line-through' : 'text-[#6E6E68]'
                }`}
              >
                {!p.liberadoMetragem && (
                  <div className="whitespace-nowrap">{p.unidades} un</div>
                )}
                {p.liberadoMetragem && (
                  <>
                    <div className="whitespace-nowrap">{p.unidades} un</div>
                    <div className="font-bold text-[#131A2E] whitespace-nowrap">
                      R$ {brl(p.total)}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-1.5 sm:mt-2">
              <span
                className={`text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-sm ${
                  p.cancelado
                    ? 'bg-[#EAE9E3] text-[#6E6E68]'
                    : 'bg-[#E3F0E8] text-[#2E7D4F]'
                }`}
              >
                {p.cancelado ? 'Cancelado' : 'Pedido fechado'}
              </span>
              <span className="text-[10px] sm:text-xs text-[#6E6E68]">
                {new Date(p.encerrado).toLocaleDateString('pt-BR')}
              </span>
            </div>

            {p.cancelado && p.motivo && (
              <p className="text-[10px] sm:text-xs text-[#6E6E68] mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-[#DDDCD5] leading-relaxed">
                {p.motivo}
              </p>
            )}
          </Link>
        ))}

        {lista.length === 0 && (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
            <p className="text-sm text-[#6E6E68]">
              {dataDe || dataAte
                ? 'Nenhum pedido arquivado nesse período.'
                : 'Nenhum pedido arquivado ainda.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}