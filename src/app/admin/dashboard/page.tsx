import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import FiltroPeriodo from './filtro-periodo'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EM_PRODUCAO = ['recebido', 'impressao', 'estampando', 'corte_costura', 'pronto']

// Depois de faturado o pedido segue no Bling até a baixa financeira. Enquanto
// não chega a "fechado", ainda é dinheiro a entrar — por isso fica no "em aberto"
const POS_FATURAMENTO = ['faturado', 'nf_emitida', 'expedido', 'entregue']

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

type ResumoCliente = {
  nome: string
  total: number
  metros: number
  pedidos: number
}

function iso(d: Date) {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function dataValida(s: string | undefined): string | null {
  if (!s || !DATA_ISO.test(s)) return null
  return isNaN(new Date(s + 'T00:00:00').getTime()) ? null : s
}

function dataCurta(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR')
}

/**
 * Período de comparação: o mês anterior quando o filtro é um mês de
 * calendário; senão, a janela de mesmo tamanho imediatamente antes.
 */
function periodoAnterior(de: Date, ate: Date) {
  const hoje = new Date()
  const ehMesCorrente =
    de.getFullYear() === hoje.getFullYear() && de.getMonth() === hoje.getMonth()
  const fimDoMes = ehMesCorrente
    ? hoje
    : new Date(de.getFullYear(), de.getMonth() + 1, 0)
  const mesInteiro = de.getDate() === 1 && iso(ate) === iso(fimDoMes)

  if (mesInteiro) {
    const inicio = new Date(de.getFullYear(), de.getMonth() - 1, 1)
    return {
      de: inicio,
      ate: new Date(de.getFullYear(), de.getMonth(), 0),
      rotulo: MESES[inicio.getMonth()].slice(0, 3),
    }
  }

  const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1
  const inicio = new Date(de)
  inicio.setDate(inicio.getDate() - dias)
  const fim = new Date(de)
  fim.setDate(fim.getDate() - 1)
  return { de: inicio, ate: fim, rotulo: `${dias} dias antes` }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const perfil = await lerPerfil()

  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) redirect('/admin/pedidos')

  const params = await searchParams
  const hoje = new Date()

  // Sem filtro, o mês corrente. Data inválida ou invertida cai no padrão
  let dataDe = dataValida(params.de) ?? iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  let dataAte = dataValida(params.ate) ?? iso(hoje)
  if (dataDe > dataAte) {
    dataDe = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    dataAte = iso(hoje)
  }

  const inicio = new Date(dataDe + 'T00:00:00')
  const fim = new Date(dataAte + 'T23:59:59.999')
  const anterior = periodoAnterior(inicio, new Date(dataAte + 'T00:00:00'))
  const inicioAnterior = anterior.de
  const fimAnterior = new Date(iso(anterior.ate) + 'T23:59:59.999')

  const mesCalendario =
    inicio.getDate() === 1 &&
    (dataAte === iso(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0)) ||
      (inicio.getFullYear() === hoje.getFullYear() &&
        inicio.getMonth() === hoje.getMonth() &&
        dataAte === iso(hoje)))
  const tituloPeriodo = mesCalendario
    ? `${MESES[inicio.getMonth()]} de ${inicio.getFullYear()}`
    : `${dataCurta(dataDe)} a ${dataCurta(dataAte)}`

  const supabase = await createClient()

  // A contagem de clientes não depende dos pedidos: busca junto
  const [{ data: pedidos }, { count: clientesAtivos }] = await Promise.all([
    supabase
    .from('pedidos')
    .select(`
      id, numero, total, created_at, cancelado_em, metragem_impressa,
      clientes(id, razao_social),
      pedido_status_historico(status, created_at),
      pedido_solicitacoes(id, status)
    `)
    // Cancelados eram trazidos e descartados aqui mesmo: filtra no banco
    .is('cancelado_em', null)
    .order('created_at', { ascending: false }),
    supabase
      .from('clientes')
      .select('*', { count: 'exact', head: true })
      .eq('ativo', true),
  ])

  const lista = ((pedidos ?? []) as any[]).map((p) => {
    const hist = (p.pedido_status_historico ?? [])
      .slice()
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    return {
      id: p.id,
      numero: p.numero,
      total: Number(p.total),
      // Metragem real, informada no romaneio ao finalizar a estampa
      metros: p.metragem_impressa != null ? Number(p.metragem_impressa) : 0,
      clienteId: p.clientes?.id ?? '',
      cliente: p.clientes?.razao_social ?? '—',
      status: hist[0]?.status ?? 'aguardando',
      cancelado: !!p.cancelado_em,
      criado: new Date(p.created_at),
      temSolicitacao: (p.pedido_solicitacoes ?? []).some(
        (s: any) => s.status === 'aberta'
      ),
    }
  })

  const validos = lista.filter((p) => !p.cancelado)

  // Pedidos aguardando confirmação não entram no faturamento
  const confirmados = validos.filter((p) => p.status !== 'aguardando')

  const doPeriodo = confirmados.filter((p) => p.criado >= inicio && p.criado <= fim)
  const doAnterior = confirmados.filter(
    (p) => p.criado >= inicioAnterior && p.criado <= fimAnterior
  )

  const fatPeriodo = doPeriodo.reduce((a, p) => a + p.total, 0)
  const fatAnterior = doAnterior.reduce((a, p) => a + p.total, 0)
  const variacao =
    fatAnterior > 0 ? ((fatPeriodo - fatAnterior) / fatAnterior) * 100 : null

  const metrosPeriodo = doPeriodo.reduce((a, p) => a + p.metros, 0)
  const ticket = doPeriodo.length > 0 ? fatPeriodo / doPeriodo.length : 0

  /* ---- em aberto: tudo que ainda não fechou, qualquer que seja a data ---- */
  const aguardando = validos.filter((p) => p.status === 'aguardando')
  const solicitacoes = validos.filter((p) => p.temSolicitacao)
  const valorAguardando = aguardando.reduce((a, p) => a + p.total, 0)

  const emProducao = validos.filter((p) => EM_PRODUCAO.includes(p.status))
  const metrosProducao = emProducao.reduce((a, p) => a + p.metros, 0)
  const valorProducao = emProducao.reduce((a, p) => a + p.total, 0)

  const posFaturamento = validos.filter((p) => POS_FATURAMENTO.includes(p.status))
  const valorPosFaturamento = posFaturamento.reduce((a, p) => a + p.total, 0)

  const emAberto = aguardando.length + emProducao.length + posFaturamento.length
  const valorEmAberto = valorAguardando + valorProducao + valorPosFaturamento

  const porCliente: Record<string, ResumoCliente> = {}

  doPeriodo.forEach((p) => {
    if (!porCliente[p.clienteId]) {
      porCliente[p.clienteId] = {
        nome: p.cliente,
        total: 0,
        metros: 0,
        pedidos: 0,
      }
    }
    porCliente[p.clienteId].total += p.total
    porCliente[p.clienteId].metros += p.metros
    porCliente[p.clienteId].pedidos += 1
  })

  const ranking = Object.values(porCliente)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  const maiorValor = ranking[0]?.total ?? 1

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Dashboard
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-4">
        {tituloPeriodo}
        {clientesAtivos ? ` · ${clientesAtivos} cliente${clientesAtivos > 1 ? 's' : ''} ativo${clientesAtivos > 1 ? 's' : ''}` : ''}
      </p>

      <FiltroPeriodo de={dataDe} ate={dataAte} />

      {/* ---- pendências ---- */}
      {(aguardando.length > 0 || solicitacoes.length > 0) && (
        <div className="mb-6">
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-2.5 flex items-center gap-2">
            PRECISA DA SUA DECISÃO
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h2>

          <div className="space-y-1.5 sm:space-y-2">
            {aguardando.length > 0 && (
              <Link
                href="/admin/pedidos?etapa=aguardando"
                className="flex items-center gap-3 bg-white border-2 border-[#0090D8] rounded-sm px-3 py-2.5 sm:px-4 sm:py-3.5 hover:bg-[#F4FAFD]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold tracking-tight text-xs sm:text-sm">
                    {aguardando.length} pedido
                    {aguardando.length > 1 ? 's' : ''} aguardando confirmação
                  </div>
                  <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5 font-mono">
                    R$ {brl(valorAguardando)} · o cliente ainda pode cancelar
                  </div>
                </div>
                <span className="text-[#0090D8] shrink-0">›</span>
              </Link>
            )}

            {solicitacoes.length > 0 && (
              <Link
                href="/admin/pedidos"
                className="flex items-center gap-3 bg-white border-2 border-[#B00063] rounded-sm px-3 py-2.5 sm:px-4 sm:py-3.5 hover:bg-[#FFF6FA]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold tracking-tight text-xs sm:text-sm">
                    {solicitacoes.length} solicitação
                    {solicitacoes.length > 1 ? 'ões' : ''} de cancelamento
                  </div>
                  <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5">
                    Pedido{solicitacoes.length > 1 ? 's' : ''} #
                    {solicitacoes.map((s) => s.numero).join(', #')}
                  </div>
                </div>
                <span className="text-[#B00063] shrink-0">›</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ---- indicadores do período ---- */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4">
          <div className="text-[9px] sm:text-[10px] tracking-[0.13em] text-[#6E6E68]">
            FATURAMENTO NO PERÍODO
          </div>
          <div className="font-mono font-semibold text-base sm:text-xl mt-0.5 sm:mt-1">
            R$ {brl(fatPeriodo)}
          </div>
          {variacao !== null && (
            <div
              className={`text-[9px] sm:text-[10px] font-mono mt-0.5 sm:mt-1 ${
                variacao >= 0 ? 'text-[#2E7D4F]' : 'text-[#B00063]'
              }`}
            >
              {variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao).toFixed(1)}% vs{' '}
              {anterior.rotulo}
            </div>
          )}
        </div>

        <Cartao rotulo="PEDIDOS NO PERÍODO" valor={String(doPeriodo.length)} />
        <Cartao rotulo="TICKET MÉDIO" valor={`R$ ${brl(ticket)}`} />
        <Cartao rotulo="METRAGEM NO PERÍODO" valor={`${brl(metrosPeriodo)} m`} />
      </div>

      {/* ---- em aberto: não depende do período ---- */}
      <Titulo>EM ABERTO — TODOS OS PERÍODOS</Titulo>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-lg sm:text-2xl font-semibold">
              {emAberto}
            </div>
            <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5">
              pedido{emAberto !== 1 ? 's' : ''} ainda não fechado{emAberto !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm sm:text-lg font-semibold">
              R$ {brl(valorEmAberto)}
            </div>
            <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5">
              a receber ou a produzir
            </div>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 sm:gap-3 mt-2 sm:mt-3">
        <Link
          href="/admin/pedidos?etapa=aguardando"
          className="block bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4 hover:border-[#131A2E]"
        >
          <div className="text-[9px] sm:text-[10px] tracking-[0.13em] text-[#6E6E68]">
            AGUARDANDO CONFIRMAÇÃO
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-0.5 sm:mt-1">
            <span className="font-mono font-semibold text-base sm:text-xl">
              {aguardando.length}
            </span>
            <span className="font-mono text-xs sm:text-sm text-[#6E6E68]">
              R$ {brl(valorAguardando)}
            </span>
          </div>
        </Link>

        <Link
          href="/admin/pedidos"
          className="block bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4 hover:border-[#131A2E]"
        >
          <div className="text-[9px] sm:text-[10px] tracking-[0.13em] text-[#6E6E68]">
            EM PRODUÇÃO
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-0.5 sm:mt-1">
            <span className="font-mono font-semibold text-base sm:text-xl">
              {emProducao.length}
            </span>
            <span className="font-mono text-xs sm:text-sm text-[#6E6E68]">
              R$ {brl(valorProducao)}
            </span>
          </div>
          <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-1 font-mono">
            {brl(metrosProducao)} m a estampar
          </div>
          <div className="mt-2 pt-2 border-t border-[#DDDCD5] flex flex-wrap gap-x-3 gap-y-1">
            {EM_PRODUCAO.map((e) => {
              const n = emProducao.filter((p) => p.status === e).length
              if (n === 0) return null
              return (
                <span key={e} className="text-[10px] sm:text-xs text-[#6E6E68]">
                  {rotuloEtapa(e)}{' '}
                  <strong className="font-mono text-[#131A2E]">{n}</strong>
                </span>
              )
            })}
            {emProducao.length === 0 && (
              <span className="text-[10px] sm:text-xs text-[#6E6E68]">nada em produção</span>
            )}
          </div>
        </Link>

        <Link
          href="/admin/pedidos?etapa=faturado"
          className="block bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4 hover:border-[#131A2E]"
        >
          <div className="text-[9px] sm:text-[10px] tracking-[0.13em] text-[#6E6E68]">
            FATURADOS, SEM BAIXA
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-0.5 sm:mt-1">
            <span className="font-mono font-semibold text-base sm:text-xl">
              {posFaturamento.length}
            </span>
            <span className="font-mono text-xs sm:text-sm text-[#6E6E68]">
              R$ {brl(valorPosFaturamento)}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#DDDCD5] flex flex-wrap gap-x-3 gap-y-1">
            {POS_FATURAMENTO.map((e) => {
              const n = posFaturamento.filter((p) => p.status === e).length
              if (n === 0) return null
              return (
                <span key={e} className="text-[10px] sm:text-xs text-[#6E6E68]">
                  {rotuloEtapa(e)}{' '}
                  <strong className="font-mono text-[#131A2E]">{n}</strong>
                </span>
              )
            })}
            {posFaturamento.length === 0 && (
              <span className="text-[10px] sm:text-xs text-[#6E6E68]">nada a receber</span>
            )}
          </div>
        </Link>
      </div>

      {/* ---- ranking ---- */}
      <Titulo>PRINCIPAIS CLIENTES NO PERÍODO</Titulo>

      {ranking.length === 0 ? (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-10 text-center">
          <p className="text-sm text-[#6E6E68]">
            Nenhum pedido confirmado neste período.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 sm:space-y-2">
          {ranking.map((c, i) => (
            <div
              key={c.nome}
              className="bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-[10px] sm:text-xs text-[#6E6E68] shrink-0">
                    {i + 1}º
                  </span>
                  <span className="font-semibold tracking-tight text-sm sm:text-base truncate">
                    {c.nome}
                  </span>
                </div>
                <span className="font-mono font-semibold text-sm sm:text-base whitespace-nowrap">
                  R$ {brl(c.total)}
                </span>
              </div>

              <div className="h-1 sm:h-1.5 bg-[#EEEDE7] rounded-full mt-1.5 sm:mt-2.5 overflow-hidden">
                <div
                  className="h-full bg-[#B00063] rounded-full"
                  style={{ width: `${(c.total / maiorValor) * 100}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] sm:text-xs text-[#6E6E68] mt-1 sm:mt-1.5">
                <span>
                  {c.pedidos} pedido{c.pedidos > 1 ? 's' : ''}
                </span>
                <span className="font-mono">{brl(c.metros)} m</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function rotuloEtapa(e: string) {
  const r: Record<string, string> = {
    recebido: 'Confirmado',
    impressao: 'Impressão',
    estampando: 'Estampando',
    corte_costura: 'Corte/costura',
    pronto: 'Pronto',
    faturado: 'Faturado',
    nf_emitida: 'NF emitida',
    expedido: 'Expedido',
    entregue: 'Entregue',
  }
  return r[e] ?? e
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4">
      <div className="text-[9px] sm:text-[10px] tracking-[0.13em] text-[#6E6E68]">
        {rotulo}
      </div>
      <div className="font-mono font-semibold text-base sm:text-xl mt-0.5 sm:mt-1">{valor}</div>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-[#DDDCD5]" />
    </h2>
  )
}
