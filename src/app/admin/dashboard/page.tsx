import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EM_PRODUCAO = ['recebido', 'impressao', 'estampando', 'corte_costura', 'pronto']

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

export default async function DashboardPage() {
  const perfil = await lerPerfil()

  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) redirect('/admin/pedidos')

  const supabase = await createClient()

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, created_at, cancelado_em, metragem_impressa,
      clientes(id, razao_social),
      pedido_status_historico(status, created_at),
      pedido_solicitacoes(id, status)
    `)
    .order('created_at', { ascending: false })

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

  const doMes = confirmados.filter((p) => p.criado >= inicioMes)
  const doMesAnterior = confirmados.filter(
    (p) => p.criado >= inicioMesAnterior && p.criado < inicioMes
  )

  const fatMes = doMes.reduce((a, p) => a + p.total, 0)
  const fatAnterior = doMesAnterior.reduce((a, p) => a + p.total, 0)
  const variacao =
    fatAnterior > 0 ? ((fatMes - fatAnterior) / fatAnterior) * 100 : null

  const metrosMes = doMes.reduce((a, p) => a + p.metros, 0)
  const emProducao = validos.filter((p) => EM_PRODUCAO.includes(p.status))
  const metrosProducao = emProducao.reduce((a, p) => a + p.metros, 0)
  const ticket = doMes.length > 0 ? fatMes / doMes.length : 0

  const aguardando = validos.filter((p) => p.status === 'aguardando')
  const solicitacoes = validos.filter((p) => p.temSolicitacao)
  const valorAguardando = aguardando.reduce((a, p) => a + p.total, 0)

  const porCliente: Record<string, ResumoCliente> = {}

  doMes.forEach((p) => {
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

  const { count: clientesAtivos } = await supabase
    .from('clientes')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Dashboard
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        {MESES[agora.getMonth()]} de {agora.getFullYear()}
      </p>

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

      {/* ---- indicadores ---- */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4">
          <div className="text-[9px] sm:text-[10px] tracking-[0.13em] text-[#6E6E68]">
            FATURAMENTO DO MÊS
          </div>
          <div className="font-mono font-semibold text-base sm:text-xl mt-0.5 sm:mt-1">
            R$ {brl(fatMes)}
          </div>
          {variacao !== null && (
            <div
              className={`text-[9px] sm:text-[10px] font-mono mt-0.5 sm:mt-1 ${
                variacao >= 0 ? 'text-[#2E7D4F]' : 'text-[#B00063]'
              }`}
            >
              {variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao).toFixed(1)}% vs{' '}
              {MESES[inicioMesAnterior.getMonth()].slice(0, 3)}
            </div>
          )}
        </div>

        <Cartao rotulo="PEDIDOS NO MÊS" valor={String(doMes.length)} />
        <Cartao rotulo="TICKET MÉDIO" valor={`R$ ${brl(ticket)}`} />
        <Cartao rotulo="METRAGEM NO MÊS" valor={`${brl(metrosMes)} m`} />
      </div>

      {/* ---- em andamento ---- */}
      <Titulo>EM ANDAMENTO</Titulo>

      <Link
        href="/admin/pedidos"
        className="block bg-white border border-[#DDDCD5] rounded-sm p-2.5 sm:p-4 hover:border-[#131A2E]"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-lg sm:text-2xl font-semibold">
              {emProducao.length}
            </div>
            <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5">
              pedidos em produção
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm sm:text-lg font-semibold">
              {brl(metrosProducao)} m
            </div>
            <div className="text-[10px] sm:text-xs text-[#6E6E68] mt-0.5">a estampar</div>
          </div>
        </div>

        <div className="mt-2 pt-2 sm:mt-3 sm:pt-3 border-t border-[#DDDCD5] flex flex-wrap gap-x-3 gap-y-1 sm:gap-x-4">
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
        </div>
      </Link>

      {/* ---- ranking ---- */}
      <Titulo>PRINCIPAIS CLIENTES DO MÊS</Titulo>

      {ranking.length === 0 ? (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-10 text-center">
          <p className="text-sm text-[#6E6E68]">
            Nenhum pedido confirmado este mês.
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