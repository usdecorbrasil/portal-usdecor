import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'

// O quadro lança etapas que falam com o Bling e com o Resend
export const maxDuration = 60
import { taxaDoPedido } from '@/lib/pagamento/config'
import { buscarValorMinimoBoleto } from '@/app/actions/configuracoes'
import NovoPedido from './novo-pedido'
import FiltroCliente from './filtro-cliente'
import FiltroData from './filtro-data'
import QuadroPedidos, { type PedidoQuadro } from './quadro-pedidos'
import FiltrosRecolhiveis from '@/components/filtros-recolhiveis'
import BuscaPagina from '@/components/busca-pagina'
import { ATIVOS, ROTULOS, sinal } from './estagios'

const DIA = 86400000

/**
 * Menor boleto do pedido — a menor parcela, ou o valor cobrado no à vista.
 * É o que o modal de "Pedido pronto" compara com o mínimo. Null quando não é
 * boleto ou a metragem ainda não deu valor ao pedido.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function valorDocumentoBoleto(p: any): number | null {
  const forma = String(p.forma_pagamento ?? '')
  const total = Number(p.total)
  if (!forma.startsWith('boleto') || total <= 0) return null

  const parcelas = (p.pedido_parcelas ?? []) as { valor: number | string }[]
  if (parcelas.length > 0) return Math.min(...parcelas.map((x) => Number(x.valor)))

  return (
    total +
    taxaDoPedido(
      total,
      Number(p.taxa_pagamento_percentual ?? 0),
      Number(p.taxa_pagamento_fixa ?? 0),
      forma,
      1
    )
  )
}

export default async function PedidosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string; cliente?: string; de?: string; ate?: string }>
}) {
  const { etapa: filtro, cliente: clienteFiltro, de: dataDe, ate: dataAte } = await searchParams
  const perfil = await lerPerfil()
  const supabase = await createClient()

  const dono = !!perfil?.veValores

  // Pedidos, lista de clientes e configuração não dependem um do outro
  const [{ data: pedidos }, { data: clientes }, valorMinimoBoleto] = await Promise.all([
    supabase
      .from('pedidos')
      .select(`
        id, numero, total, cliente_id, created_at, cancelado_em, metragem_impressa,
        forma_pagamento, emitir_nf, agrupado_em, notas, bloqueado_credito,
        taxa_pagamento_percentual, taxa_pagamento_fixa,
        pedido_parcelas(valor),
        clientes(razao_social),
        pedido_status_historico(status, created_at),
        pedido_itens(quantidade_faturada),
        pedido_solicitacoes(id, status)
      `)
      .is('cancelado_em', null)
      // Pedidos agrupados em outro saem da lista: quem segue é o agrupador
      .is('agrupado_em', null)
      .order('created_at', { ascending: false }),
    dono
      ? supabase
          .from('clientes')
          .select('id, razao_social')
          .eq('ativo', true)
          .order('razao_social')
      : Promise.resolve({ data: null }),
    buscarValorMinimoBoleto(),
  ])

  const agora = Date.now()

  const listaCompleta: (PedidoQuadro & { clienteId: string })[] = (
    (pedidos ?? []) as any[]
  )
    .map((p) => {
      const hist = (p.pedido_status_historico ?? [])
        .slice()
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      const ultimo = hist[0]
      const status = ultimo?.status ?? 'aguardando'

      const liberadoMetragem =
        ATIVOS.indexOf(status) >= ATIVOS.indexOf('estampando')

      return {
        id: p.id,
        numero: p.numero,
        clienteId: p.cliente_id as string,
        total: Number(p.total),
        metragemImpressa: p.metragem_impressa ? Number(p.metragem_impressa) : null,
        liberadoMetragem,
        unidades: (p.pedido_itens ?? []).reduce(
          (a: number, i: any) => a + Number(i.quantidade_faturada),
          0
        ),
        cliente: p.clientes?.razao_social ?? '—',
        status,
        formaPagamento: (p.forma_pagamento as string) ?? '',
        emitirNf: p.emitir_nf !== false,
        valorDocumentoBoleto: valorDocumentoBoleto(p),
        dias: ultimo
          ? Math.floor((agora - new Date(ultimo.created_at).getTime()) / DIA)
          : 0,
        entrada: p.created_at,
        temSolicitacao: (p.pedido_solicitacoes ?? []).some(
          (s: any) => s.status === 'aberta'
        ),
        notas: (p.notas as string | null)?.trim() || null,
        bloqueadoCredito: p.bloqueado_credito === true,
      }
    })
    .filter((p) => ATIVOS.includes(p.status))

  let lista = clienteFiltro
    ? listaCompleta.filter((p) => p.clienteId === clienteFiltro)
    : listaCompleta

  if (dataDe) {
    const inicio = new Date(dataDe + 'T00:00:00')
    lista = lista.filter((p) => new Date(p.entrada) >= inicio)
  }
  if (dataAte) {
    const fim = new Date(dataAte + 'T23:59:59')
    lista = lista.filter((p) => new Date(p.entrada) <= fim)
  }

  const etapas = [...new Set(lista.map((p) => p.status))].sort(
    (a, b) => ATIVOS.indexOf(a) - ATIVOS.indexOf(b)
  )

  function hrefEtapa(etapa?: string) {
    const params = new URLSearchParams()
    if (etapa) params.set('etapa', etapa)
    if (clienteFiltro) params.set('cliente', clienteFiltro)
    if (dataDe) params.set('de', dataDe)
    if (dataAte) params.set('ate', dataAte)
    const qs = params.toString()
    return '/admin/pedidos' + (qs ? '?' + qs : '')
  }

  const visiveis = filtro ? lista.filter((p) => p.status === filtro) : lista

  const grupos = ATIVOS.filter((status) =>
    visiveis.some((p) => p.status === status)
  ).map((status) => ({
    status,
    itens: visiveis
      .filter((p) => p.status === status)
      .sort((a, b) => b.dias - a.dias),
  }))

  const aguardando = lista.filter((p) => p.status === 'aguardando').length
  const solicitacoes = lista.filter((p) => p.temSolicitacao).length
  const criticos = lista.filter((p) => sinal(p.status, p.dias).cl === 'crit').length

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
              Pedidos
            </h1>
            <BuscaPagina
              placeholder="Filtrar por nº ou cliente..."
              rotulo="Filtrar os pedidos desta página"
            />
          </div>
          <p className="text-sm text-[#6E6E68] mt-1 mb-4">
            {lista.length} {lista.length === 1 ? 'pedido ativo' : 'pedidos ativos'}
            {criticos > 0 && (
              <>
                {' · '}
                <strong className="text-[#B00063]">
                  {criticos} parado{criticos > 1 ? 's' : ''} há dias
                </strong>
              </>
            )}
          </p>
        </div>

        {dono && (
          <Link
            href="/admin/arquivados"
            className="text-xs tracking-widest text-[#6E6E68] hover:text-[#131A2E] whitespace-nowrap pt-1"
          >
            ARQUIVADOS →
          </Link>
        )}
      </div>

      <FiltrosRecolhiveis
        temFiltroAtivo={!!clienteFiltro || !!dataDe || !!dataAte}
        acoes={dono ? <NovoPedido clientes={clientes ?? []} /> : null}
      >
        {dono && clientes && clientes.length > 0 && (
          <FiltroCliente
            clientes={clientes}
            clienteAtual={clienteFiltro}
            etapaAtual={filtro}
          />
        )}
        <FiltroData
          rota="/admin/pedidos"
          etapaAtual={filtro}
          clienteAtual={clienteFiltro}
          deAtual={dataDe}
          ateAtual={dataAte}
        />
      </FiltrosRecolhiveis>

      {(aguardando > 0 || solicitacoes > 0) && (
        <div className="space-y-1.5 mb-4">
          {aguardando > 0 && (
            <Link
              href={hrefEtapa('aguardando')}
              className="flex items-center gap-2.5 bg-[#F4FAFD] border border-[#0090D8] rounded-sm px-3 py-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#0090D8] shrink-0" />
              <span className="text-xs flex-1">
                <strong>
                  {aguardando} pedido{aguardando > 1 ? 's' : ''}
                </strong>{' '}
                aguardando confirmação
              </span>
              <span className="text-[#0090D8] text-xs">›</span>
            </Link>
          )}
          {solicitacoes > 0 && dono && (
            <div className="flex items-center gap-2.5 bg-[#FFF6FA] border border-[#B00063] rounded-sm px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B00063] shrink-0" />
              <span className="text-xs">
                <strong>
                  {solicitacoes} solicitação
                  {solicitacoes > 1 ? 'ões' : ''}
                </strong>{' '}
                de cancelamento pendente{solicitacoes > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {lista.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-5 px-5">
          <Chip
            href={hrefEtapa(undefined)}
            ativo={!filtro}
            rotulo="Todos"
            n={lista.length}
          />
          {etapas.map((e) => (
            <Chip
              key={e}
              href={hrefEtapa(e)}
              ativo={filtro === e}
              rotulo={ROTULOS[e]}
              n={lista.filter((p) => p.status === e).length}
            />
          ))}
        </div>
      )}

      <QuadroPedidos
        grupos={grupos}
        dono={dono}
        podeMover
        valorMinimoBoleto={valorMinimoBoleto}
      />

      {/* Aparece só quando a busca da página não encontra nada */}
      <div
        data-busca-vazio
        style={{ display: 'none' }}
        className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-8"
      >
        <p className="text-sm text-[#6E6E68]">
          Nenhum pedido desta página bate com o texto buscado.
        </p>
      </div>

      {visiveis.length === 0 && (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-8">
          <p className="text-sm text-[#6E6E68]">
            {filtro || dataDe || dataAte
              ? 'Nenhum pedido encontrado com esses filtros.'
              : 'Nenhum pedido ativo.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Chip({
  href,
  ativo,
  rotulo,
  n,
}: {
  href: string
  ativo: boolean
  rotulo: string
  n: number
}) {
  return (
    <Link
      href={href}
      className={
        (ativo
          ? 'bg-[#131A2E] text-white border-[#131A2E]'
          : 'bg-white text-[#6E6E68] border-[#DDDCD5]') +
        ' shrink-0 text-[11px] font-semibold rounded-full px-3 py-1.5 border whitespace-nowrap'
      }
    >
      {rotulo}
      <span className="ml-1.5 font-mono text-[10px] opacity-65">{n}</span>
    </Link>
  )
}