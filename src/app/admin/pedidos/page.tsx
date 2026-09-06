import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import NovoPedido from './novo-pedido'
import FiltroCliente from './filtro-cliente'
import FiltroData from './filtro-data'
import SelecaoRomaneio from './selecao-romaneio'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ROTULOS: Record<string, string> = {
  aguardando: 'Aguardando confirmação',
  recebido: 'Pedido confirmado',
  impressao: 'Impressão',
  estampando: 'Estampando',
  corte_costura: 'Em corte / costura',
  pronto: 'Pedido pronto',
  nf_emitida: 'Nota fiscal emitida',
  expedido: 'Expedido',
  entregue: 'Entregue',
}

const ATIVOS = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'corte_costura',
  'pronto', 'nf_emitida', 'expedido', 'entregue',
]

const EM_PRODUCAO = ['recebido', 'impressao', 'estampando', 'corte_costura', 'pronto']

const DIA = 86400000

function sinal(status: string, dias: number) {
  if (status === 'aguardando') {
    return { cl: 'novo', tx: 'Aguardando sua confirmação' }
  }
  if (!EM_PRODUCAO.includes(status)) {
    return { cl: 'bling', tx: 'Aguardando o Bling' }
  }
  if (dias >= 4) return { cl: 'crit', tx: 'Parado há ' + dias + ' dias' }
  if (dias >= 2) return { cl: 'aten', tx: 'Parado há ' + dias + ' dias' }
  return {
    cl: 'ok',
    tx: dias === 0 ? 'Movimentado hoje' : 'Movimentado ontem',
  }
}

function nivelUrgencia(cl: string) {
  if (cl === 'crit' || cl === 'novo') return 'forte'
  if (cl === 'aten') return 'medio'
  return 'leve'
}

type Tons = {
  leve: string
  medio: string
  forte: string
}

type CorEstagio = {
  fundo: string
  borda: string
  texto: string
  tarja: Tons
}

const CORES_ESTAGIO: { [key: string]: CorEstagio } = {
  aguardando: {
    fundo: 'bg-[#EEF3F7]',
    borda: 'border-[#8FADC4]',
    texto: 'text-[#4A6B85]',
    tarja: {
      leve: 'bg-[#E4EDF3] text-[#5D7A93]',
      medio: 'bg-[#C7D9E6] text-[#3D5870]',
      forte: 'bg-[#9FBBCF] text-[#24384A]',
    },
  },
  recebido: {
    fundo: 'bg-[#EEF5F4]',
    borda: 'border-[#85B0AC]',
    texto: 'text-[#457066]',
    tarja: {
      leve: 'bg-[#E2EEEC] text-[#4F7A72]',
      medio: 'bg-[#BEDAD5] text-[#2F5850]',
      forte: 'bg-[#8FBBB3] text-[#1D3B34]',
    },
  },
  impressao: {
    fundo: 'bg-[#F7F1E6]',
    borda: 'border-[#C4A868]',
    texto: 'text-[#8A6E33]',
    tarja: {
      leve: 'bg-[#F0E5CC] text-[#93773D]',
      medio: 'bg-[#DFC896] text-[#6B5320]',
      forte: 'bg-[#C4A868] text-[#4A3810]',
    },
  },
  estampando: {
    fundo: 'bg-[#F2EFF7]',
    borda: 'border-[#A997C4]',
    texto: 'text-[#6B5787]',
    tarja: {
      leve: 'bg-[#E8E2F0] text-[#766093]',
      medio: 'bg-[#D0C2E3] text-[#55406F]',
      forte: 'bg-[#A997C4] text-[#382953]',
    },
  },
  corte_costura: {
    fundo: 'bg-[#F7EFF3]',
    borda: 'border-[#C495AC]',
    texto: 'text-[#8A4F66]',
    tarja: {
      leve: 'bg-[#F0E1E8] text-[#93586F]',
      medio: 'bg-[#E0BECE] text-[#6B324A]',
      forte: 'bg-[#C495AC] text-[#4A1E30]',
    },
  },
  pronto: {
    fundo: 'bg-[#EEF4F0]',
    borda: 'border-[#85AD92]',
    texto: 'text-[#45664F]',
    tarja: {
      leve: 'bg-[#E1EDE4] text-[#4F7358]',
      medio: 'bg-[#BDD9C6] text-[#2F4E37]',
      forte: 'bg-[#8CB399] text-[#1D3323]',
    },
  },
  nf_emitida: {
    fundo: 'bg-[#EFF1F6]',
    borda: 'border-[#92A0C0]',
    texto: 'text-[#4E5D80]',
    tarja: {
      leve: 'bg-[#E4E7F0] text-[#586A8E]',
      medio: 'bg-[#C4CBE1] text-[#3A4763]',
      forte: 'bg-[#92A0C0] text-[#262F45]',
    },
  },
  expedido: {
    fundo: 'bg-[#F7F0E7]',
    borda: 'border-[#C4A17A]',
    texto: 'text-[#8A6541]',
    tarja: {
      leve: 'bg-[#F0E3D1] text-[#93714A]',
      medio: 'bg-[#E0C6A3] text-[#6B4D2C]',
      forte: 'bg-[#C4A17A] text-[#4A3419]',
    },
  },
  entregue: {
    fundo: 'bg-[#EEF4EF]',
    borda: 'border-[#7FAA8B]',
    texto: 'text-[#416150]',
    tarja: {
      leve: 'bg-[#E1EEE3] text-[#4A6F57]',
      medio: 'bg-[#B9D8C2] text-[#2C4C38]',
      forte: 'bg-[#85B594] text-[#1B3325]',
    },
  },
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

  // Pedidos e lista de clientes não dependem um do outro
  const [{ data: pedidos }, { data: clientes }] = await Promise.all([
    supabase
      .from('pedidos')
      .select(`
        id, numero, total, cliente_id, created_at, cancelado_em, metragem_impressa,
        clientes(razao_social),
        pedido_status_historico(status, created_at),
        pedido_itens(quantidade_faturada),
        pedido_solicitacoes(id, status)
      `)
      .is('cancelado_em', null)
      .order('created_at', { ascending: false }),
    dono
      ? supabase
          .from('clientes')
          .select('id, razao_social')
          .eq('ativo', true)
          .order('razao_social')
      : Promise.resolve({ data: null }),
  ])

  const agora = Date.now()

  const listaCompleta = ((pedidos ?? []) as any[])
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
        dias: ultimo
          ? Math.floor((agora - new Date(ultimo.created_at).getTime()) / DIA)
          : 0,
        entrada: p.created_at,
        temSolicitacao: (p.pedido_solicitacoes ?? []).some(
          (s: any) => s.status === 'aberta'
        ),
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
            Pedidos
          </h1>
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

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
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
      </div>

      {(aguardando > 0 || solicitacoes > 0) && (
        <div className="space-y-2 mb-5">
          {aguardando > 0 && (
            <Link
              href={hrefEtapa('aguardando')}
              className="flex items-center gap-3 bg-[#F4FAFD] border border-[#0090D8] rounded-sm px-4 py-3"
            >
              <span className="w-2 h-2 rounded-full bg-[#0090D8] shrink-0" />
              <span className="text-sm flex-1">
                <strong>
                  {aguardando} pedido{aguardando > 1 ? 's' : ''}
                </strong>{' '}
                aguardando confirmação
              </span>
              <span className="text-[#0090D8] text-sm">›</span>
            </Link>
          )}
          {solicitacoes > 0 && dono && (
            <div className="flex items-center gap-3 bg-[#FFF6FA] border border-[#B00063] rounded-sm px-4 py-3">
              <span className="w-2 h-2 rounded-full bg-[#B00063] shrink-0" />
              <span className="text-sm">
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

      {dono && <NovoPedido clientes={clientes ?? []} />}

      {lista.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-4 -mx-5 px-5">
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

      <div className="space-y-8">
        {grupos.map((grupo) => {
          const ce = CORES_ESTAGIO[grupo.status]

          return (
            <section key={grupo.status} className="relative">
              <div
                className={
                  ce.fundo +
                  ' inline-flex items-center gap-2 border-2 border-b-0 ' +
                  ce.borda +
                  ' rounded-t-lg px-5 py-2 relative z-10 -mb-0.5'
                }
              >
                <h2 className={ce.texto + ' font-bold tracking-tight text-base sm:text-lg'}>
                  {ROTULOS[grupo.status]}
                </h2>
                <span className={ce.texto + ' font-mono font-semibold opacity-70 text-sm'}>
                  {grupo.itens.length}
                </span>
              </div>

              <div
                className={
                  'border-2 ' +
                  ce.borda +
                  ' rounded-b-sm rounded-tr-sm p-2.5 sm:p-3 space-y-2 sm:space-y-3 bg-white'
                }
              >
                {grupo.status === 'estampando' ? (
                  <SelecaoRomaneio
                    itens={grupo.itens.map((p) => ({
                      id: p.id,
                      numero: p.numero,
                      cliente: p.cliente,
                      unidades: p.unidades,
                      total: p.total,
                      metragemImpressa: p.metragemImpressa,
                      temSolicitacao: p.temSolicitacao,
                      entrada: p.entrada,
                      dias: p.dias,
                    }))}
                    dono={dono}
                    borda={ce.borda}
                    tarja={ce.tarja}
                  />
                ) : (
                  grupo.itens.map((p) => {
                    const s = sinal(p.status, p.dias)
                    const nivel = nivelUrgencia(s.cl)
                    const tarjaClasse = ce.tarja[nivel as keyof Tons]

                    return (
                      <Link
                        key={p.id}
                        href={'/admin/pedidos/' + p.id}
                        className={'block bg-white border rounded-sm overflow-hidden ' + ce.borda}
                      >
                        <div
                          className={
                            tarjaClasse +
                            ' text-[9px] sm:text-[10px] tracking-[0.13em] font-mono px-3 py-1 sm:px-4 sm:py-1.5 flex justify-between gap-2'
                          }
                        >
                          <span>{s.tx.toUpperCase()}</span>
                          {p.temSolicitacao && (
                            <span className="normal-case tracking-normal">
                              pediu cancelamento
                            </span>
                          )}
                        </div>

                        <div className="p-2.5 sm:p-3 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs sm:text-sm font-mono text-[#6E6E68] whitespace-nowrap shrink-0">
                                {p.numero} ·
                              </span>
                              <span className="font-semibold tracking-tight text-base sm:text-lg truncate">
                                {p.cliente}
                              </span>
                            </div>
                            <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.11em] text-[#6E6E68]">
                              ENTROU{' '}
                              {new Date(p.entrada).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </div>
                          </div>

                          <div className="text-right shrink-0 text-xs sm:text-sm font-mono text-[#6E6E68]">
                            {!p.liberadoMetragem && (
                              <div className="whitespace-nowrap">{p.unidades} un</div>
                            )}
                            {p.liberadoMetragem && !dono && (
                              <div className="whitespace-nowrap">
                                {brl(p.metragemImpressa ?? 0)} m
                              </div>
                            )}
                            {p.liberadoMetragem && dono && (
                              <>
                                <div className="whitespace-nowrap">{p.unidades} un</div>
                                <div className="font-bold text-[#131A2E] whitespace-nowrap">
                                  R$ {brl(p.total)}
                                </div>
                              </>
                            )}
                          </div>

                          <span className="text-[#DDDCD5] shrink-0 text-lg leading-none">
                            ›
                          </span>
                        </div>
                      </Link>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}

        {visiveis.length === 0 && (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
            <p className="text-sm text-[#6E6E68]">
              {filtro || dataDe || dataAte
                ? 'Nenhum pedido encontrado com esses filtros.'
                : 'Nenhum pedido ativo.'}
            </p>
          </div>
        )}
      </div>
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
        ' shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 border whitespace-nowrap'
      }
    >
      {rotulo}
      <span className="ml-1.5 font-mono text-[10px] opacity-65">{n}</span>
    </Link>
  )
}