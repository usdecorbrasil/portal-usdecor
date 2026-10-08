import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FiltroData from '../pedidos/filtro-data'
import BuscaPagina from '@/components/busca-pagina'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'
import FiltrosRecolhiveis from '@/components/filtros-recolhiveis'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ATIVOS = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'pronto',
  'faturado', 'nf_emitida', 'corte_costura', 'expedido', 'entregue', 'fechado',
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Pedidos arquivados
        </h1>
        <BuscaPagina
          placeholder="Filtrar por nº ou cliente..."
          rotulo="Filtrar os arquivados desta página"
        />
      </div>
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
        <div className="bg-white border border-[#E4E3DC] rounded-sm px-3 py-2 mb-4 flex items-baseline justify-between gap-3">
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">
            Total faturado
          </span>
          <strong className="font-mono text-base tabular-nums">
            R$ {brl(faturado)}
          </strong>
        </div>
      )}

      <div className={CAIXA}>
        <div className={CABECALHO}>
          <span className="w-1 shrink-0" aria-hidden />
          <span className="w-9 shrink-0">Nº</span>
          <span className="flex-1 min-w-0">Cliente</span>
          <span className="w-14 shrink-0 text-right">Qtd</span>
          <span className="w-20 shrink-0 text-right">Valor</span>
          <span aria-hidden className="w-2 shrink-0" />
        </div>

        <div className={CORPO}>
          {lista.map((p) => (
            <Link
              key={p.id}
              href={`/admin/pedidos/${p.id}`}
              data-busca={`${p.numero} ${p.cliente}`}
              className="flex items-stretch bg-white hover:bg-[#FAFAF8]"
            >
              <span
                aria-hidden
                className={
                  'w-1 shrink-0 ' +
                  (p.cancelado ? 'bg-[#C495AC]' : 'bg-[#8CB399]')
                }
              />

              <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5">
                <span className={NUM + ' w-9 shrink-0 text-[#6E6E68]'}>
                  {p.numero}
                </span>

                <span
                  className={
                    NOME +
                    ' flex-1 min-w-0 ' +
                    (p.cancelado ? 'line-through text-[#9B9A93]' : '')
                  }
                >
                  {p.cliente}
                </span>

                {p.cancelado && (
                  <span className={ETIQUETA + ' bg-[#F7EFF3] text-[#8A4F66]'}>
                    cancelado
                  </span>
                )}

                <span className={NUM + ' w-14 shrink-0 text-right text-[#6E6E68]'}>
                  {p.unidades} un
                </span>

                <span
                  className={
                    NUM +
                    ' w-20 shrink-0 text-right font-semibold ' +
                    (p.cancelado ? 'text-[#9B9A93] line-through' : 'text-[#131A2E]')
                  }
                >
                  {p.liberadoMetragem ? brl(p.total) : '—'}
                </span>

                <span className="text-[#DDDCD5] shrink-0 leading-none">›</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {lista.length === 0 && (
        <div className={VAZIO}>
          {dataDe || dataAte
            ? 'Nenhum pedido arquivado nesse período.'
            : 'Nenhum pedido arquivado ainda.'}
        </div>
      )}
    </div>
  )
}