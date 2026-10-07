import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { valorCobranca } from '@/lib/pagamento/config'
import BuscaPagina from '@/components/busca-pagina'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, VAZIO } from '@/components/estilo-lista'
import AbasPedidos from './abas-pedidos'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ETAPAS: Record<string, { label: string; cor: string }> = {
  recebido:      { label: 'Pedido recebido',   cor: 'bg-[#E6EDEE] text-[#0090D8]' },
  impressao:     { label: 'Impressão',         cor: 'bg-[#FBF0D9] text-[#C79600]' },
  estampando:    { label: 'Estampando',        cor: 'bg-[#FBF0D9] text-[#C79600]' },
  corte_costura: { label: 'Em corte / costura',cor: 'bg-[#FBF0D9] text-[#C79600]' },
  pronto:        { label: 'Pedido pronto',     cor: 'bg-[#FBF0D9] text-[#C79600]' },
  faturado:      { label: 'Faturado',          cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  nf_emitida:    { label: 'Nota fiscal emitida', cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  expedido:      { label: 'Expedido',          cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  entregue:      { label: 'Entregue',          cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  fechado:       { label: 'Pedido fechado',    cor: 'bg-[#EAE9E3] text-[#6E6E68]' },
}

const ORDEM = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'corte_costura',
  'pronto', 'faturado', 'nf_emitida', 'expedido', 'entregue', 'fechado',
]

export default async function PedidosPage() {
  const supabase = await createClient()

  // As políticas do banco garantem que só vêm os pedidos deste cliente.
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, created_at, cancelado_em, metragem_impressa,
      forma_pagamento, parcelas_solicitadas,
      taxa_pagamento_percentual, taxa_pagamento_fixa,
      pedido_itens(quantidade_faturada),
      pedido_parcelas(numero),
      pedido_status_historico(status, created_at)
    `)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Meus pedidos
        </h1>
        <BuscaPagina
          placeholder="Filtrar por número..."
          rotulo="Filtrar os pedidos desta página"
        />
      </div>
      <p className="text-sm text-[#6E6E68] mt-1 mb-4">
        Acompanhe a produção em tempo real
      </p>

      <AbasPedidos />

      <div className={CAIXA}>
        <div className={CABECALHO}>
          <span className="w-1 shrink-0" aria-hidden />
          <span className="w-9 shrink-0">Nº</span>
          <span className="w-11 shrink-0">Data</span>
          <span className="flex-1 min-w-0">Situação</span>
          <span className="w-14 shrink-0 text-right">Qtd</span>
          <span className="w-20 shrink-0 text-right">Valor</span>
          <span aria-hidden className="w-2 shrink-0" />
        </div>

        <div className={CORPO}>
          {pedidos?.map((p) => {
            const hist = (p.pedido_status_historico ?? [])
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )

            const atual = hist[0]?.status ?? 'recebido'
            const etapa = ETAPAS[atual] ?? ETAPAS.recebido
            const cancelado = !!p.cancelado_em
            const liberadoValor = ORDEM.indexOf(atual) >= ORDEM.indexOf('pronto')
            const unidades = (p.pedido_itens ?? []).reduce(
              (a: number, i: any) => a + Number(i.quantidade_faturada),
              0
            )
            const metros =
              p.metragem_impressa != null ? Number(p.metragem_impressa) : null

            return (
              <Link
                key={p.id}
                href={`/pedidos/${p.id}`}
                data-busca={`${p.numero} ${etapa.label}`}
                className="flex items-stretch bg-white hover:bg-[#FAFAF8]"
              >
                <span
                  aria-hidden
                  className={
                    'w-1 shrink-0 ' +
                    (cancelado ? 'bg-[#DDDCD5]' : liberadoValor ? 'bg-[#8CB399]' : 'bg-[#C4A868]')
                  }
                />

                <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5">
                  <span className={NUM + ' w-9 shrink-0 text-[#6E6E68]'}>
                    {p.numero}
                  </span>

                  <span className={NUM + ' w-11 shrink-0 text-[#9B9A93]'}>
                    {new Date(p.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>

                  <span className="flex-1 min-w-0">
                    <span
                      className={
                        ETIQUETA +
                        ' ' +
                        (cancelado
                          ? 'bg-[#EAE9E3] text-[#6E6E68] line-through'
                          : etapa.cor)
                      }
                    >
                      {cancelado ? 'cancelado' : etapa.label}
                    </span>
                  </span>

                  <span className={NUM + ' w-14 shrink-0 text-right text-[#6E6E68]'}>
                    {metros !== null ? brl(metros) + ' m' : unidades + ' un'}
                  </span>

                  <span className={NUM + ' w-20 shrink-0 text-right font-semibold text-[#131A2E]'}>
                    {liberadoValor
                      ? 'R$ ' +
                        brl(
                          valorCobranca(
                            Number(p.total),
                            Number(p.taxa_pagamento_percentual ?? 0),
                            Number(p.taxa_pagamento_fixa ?? 0),
                            // Sem forma (antes do faturamento) a taxa é zero
                            p.forma_pagamento ?? '',
                            (p.pedido_parcelas ?? []).length ||
                              Number(p.parcelas_solicitadas ?? 1)
                          )
                        )
                      : '—'}
                  </span>

                  <span className="text-[#DDDCD5] shrink-0 leading-none">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {(!pedidos || pedidos.length === 0) && (
        <div className={VAZIO}>
          <p>Você ainda não fez nenhum pedido.</p>
          <Link
            href="/catalogo"
            className="inline-block mt-3 text-sm text-[#B00063] hover:underline"
          >
            Ir para o catálogo
          </Link>
        </div>
      )}
    </div>
  )
}