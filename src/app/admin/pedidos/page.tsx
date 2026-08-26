import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import NovoPedido from './novo-pedido'
import FiltroCliente from './filtro-cliente'
import FiltroData from './filtro-data'

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

const DIA = 86_400_000

function sinal(status: string, dias: number) {
  if (status === 'aguardando') {
    return { cl: 'novo', tx: 'Aguardando sua confirmação', ord: -1 }
  }
  if (!EM_PRODUCAO.includes(status)) {
    return { cl: 'bling', tx: 'Aguardando o Bling', ord: 4 }
  }
  if (dias >= 7) return { cl: 'crit', tx: `Parado há ${dias} dias`, ord: 0 }
  if (dias >= 4) return { cl: 'crit', tx: `Parado há ${dias} dias`, ord: 1 }
  if (dias >= 2) return { cl: 'aten', tx: `Parado há ${dias} dias`, ord: 2 }
  return {
    cl: 'ok',
    tx: dias === 0 ? 'Movimentado hoje' : 'Movimentado ontem',
    ord: 3,
  }
}

const CORES: Record<string, { borda: string; tarja: string }> = {
  novo:  { borda: 'border-[#0090D8]', tarja: 'bg-[#0090D8] text-white' },
  crit:  { borda: 'border-[#B00063]', tarja: 'bg-[#B00063] text-white' },
  aten:  { borda: 'border-[#E8C36B]', tarja: 'bg-[#FBF0D9] text-[#C79600]' },
  ok:    { borda: 'border-[#DDDCD5]', tarja: 'bg-[#EFF3F0] text-[#2E7D4F]' },
  bling: { borda: 'border-[#DDDCD5]', tarja: 'bg-[#E6EDEE] text-[#0090D8]' },
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

  const campos = dono
    ? `id, numero, total, cliente_id, created_at, cancelado_em,
       clientes(razao_social),
       pedido_status_historico(status, created_at),
       pedido_itens(metros_total),
       pedido_solicitacoes(id, status)`
    : `id, numero, cliente_id, created_at, cancelado_em,
       clientes(razao_social),
       pedido_status_historico(status, created_at),
       pedido_itens(metros_total),
       pedido_solicitacoes(id, status)`

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(campos)
    .is('cancelado_em', null)
    .order('created_at', { ascending: false })

  const { data: clientes } = dono
    ? await supabase
        .from('clientes')
        .select('id, razao_social')
        .eq('ativo', true)
        .order('razao_social')
    : { data: null }

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

      return {
        id: p.id,
        numero: p.numero,
        clienteId: p.cliente_id as string,
        total: p.total !== undefined ? Number(p.total) : null,
        metros: (p.pedido_itens ?? []).reduce(
          (a: number, i: any) => a + Number(i.metros_total),
          0
        ),
        cliente: p.clientes?.razao_social ?? '—',
        status: ultimo?.status ?? 'aguardando',
        desde: ultimo?.created_at ?? p.created_at,
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

  // Escopo: todos os pedidos, filtrado por cliente e/ou intervalo de datas
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
    return `/admin/pedidos${qs ? `?${qs}` : ''}`
  }

  const visiveis = (filtro ? lista.filter((p) => p.status === filtro) : lista)
    .sort((a, b) => {
      const sa = sinal(a.status, a.dias)
      const sb = sinal(b.status, b.dias)
      return sa.ord - sb.ord || b.dias - a.dias
    })

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

      <div className="space-y-2 sm:space-y-3">
        {visiveis.map((p) => {
          const s = sinal(p.status, p.dias)
          const c = CORES[s.cl]

          return (
            <Link
              key={p.id}
              href={`/admin/pedidos/${p.id}`}
              className={`block bg-white border rounded-sm overflow-hidden ${c.borda}`}
            >
              <div
                className={`text-[9px] sm:text-[10px] tracking-[0.13em] font-mono px-3 py-1 sm:px-4 sm:py-1.5 flex justify-between gap-2 ${c.tarja}`}
              >
                <span>{s.tx.toUpperCase()}</span>
                {p.temSolicitacao && (
                  <span className="normal-case tracking-normal">
                    pediu cancelamento
                  </span>
                )}
              </div>

              <div className="p-3 sm:p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold tracking-tight text-base sm:text-lg truncate">
                    {p.cliente}
                  </span>
                  <span className="font-mono font-semibold text-sm sm:text-base whitespace-nowrap shrink-0">
                    #{p.numero}
                  </span>
                </div>

                <p className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5 sm:mt-1 font-mono">
                  {p.total !== null
                    ? `R$ ${brl(p.total)}`
                    : `${brl(p.metros)} m`}
                </p>

                <div className="mt-1.5 sm:mt-2">
                  <span
                    className={`text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-sm ${
                      p.status === 'aguardando'
                        ? 'bg-[#E6EDEE] text-[#0090D8]'
                        : 'bg-[#FBF0D9] text-[#C79600]'
                    }`}
                  >
                    {ROTULOS[p.status]}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 mt-2 pt-2 sm:mt-3 sm:pt-3 border-t border-[#DDDCD5] text-[9px] sm:text-[10px] font-mono tracking-[0.11em] text-[#6E6E68]">
                  <span>
                    ENTROU{' '}
                    {new Date(p.entrada).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                    {p.total !== null && ` · ${brl(p.metros)} M`}
                  </span>
                  <span className="text-[#B00063] font-semibold">abrir →</span>
                </div>
              </div>
            </Link>
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
      className={`shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 border whitespace-nowrap ${
        ativo
          ? 'bg-[#131A2E] text-white border-[#131A2E]'
          : 'bg-white text-[#6E6E68] border-[#DDDCD5]'
      }`}
    >
      {rotulo}
      <span className="ml-1.5 font-mono text-[10px] opacity-65">{n}</span>
    </Link>
  )
}