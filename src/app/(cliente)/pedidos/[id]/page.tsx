import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AcoesCliente from './acoes-cliente'

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
  fechado: 'Pedido fechado',
}

function dataHora(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

export default async function DetalhePedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, notas, created_at, cancelado_em, cancelado_motivo,
      pedido_itens(
        id, produto_id, sku, nome, tecido, preco_unitario, metros_por_unidade,
        quantidade_pedida, quantidade_faturada, metros_total, subtotal
      ),
      pedido_status_historico(status, created_at),
      pedido_ajustes(motivo, created_at),
      pedido_solicitacoes(id, texto, status, resposta, created_at)
    `)
    .eq('id', id)
    .single()

  if (!pedido) notFound()

  const p = pedido as any
  const itens = (p.pedido_itens ?? []) as any[]

  // Miniaturas
  const urls = new Map<string, string>()
  if (itens.length) {
    const { data: produtos } = await supabase
      .from('produtos')
      .select('id, imagem_path')
      .in('id', itens.map((i) => i.produto_id))

    const caminhos = (produtos ?? [])
      .map((x) => x.imagem_path)
      .filter(Boolean) as string[]

    if (caminhos.length) {
      const { data: assinadas } = await supabase.storage
        .from('artes')
        .createSignedUrls(caminhos, 3600)

      const porCaminho = new Map<string, string>()
      assinadas?.forEach((a) => {
        if (a.path && a.signedUrl) porCaminho.set(a.path, a.signedUrl)
      })
      produtos?.forEach((x) => {
        if (x.imagem_path) {
          const u = porCaminho.get(x.imagem_path)
          if (u) urls.set(x.id, u)
        }
      })
    }
  }

  const hist = (p.pedido_status_historico ?? [])
    .slice()
    .sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

  const atual = hist[hist.length - 1]?.status ?? 'aguardando'
  const cancelado = !!p.cancelado_em
  const aguardando = atual === 'aguardando'
  const ajuste = (p.pedido_ajustes ?? [])[0]

  const solicitacoes = (p.pedido_solicitacoes ?? []) as any[]
  const aberta = solicitacoes.find((s) => s.status === 'aberta')
  const recusada = solicitacoes.find((s) => s.status === 'recusada')

  // Pode solicitar cancelamento até a nota fiscal sair
  const podeSolicitar =
    !cancelado &&
    !aguardando &&
    !['nf_emitida', 'expedido', 'entregue', 'fechado'].includes(atual)

  const metrosTotal = itens.reduce((a, i) => a + Number(i.metros_total), 0)
  const temAjuste = itens.some(
    (i) => i.quantidade_faturada !== i.quantidade_pedida
  )

  return (
    <div>
      <Link
        href="/pedidos"
        className="text-xs tracking-widest text-[#6E6E68] hover:text-[#131A2E]"
      >
        ← PEDIDOS
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] mt-3">
        Pedido #{p.numero}
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1">
        Enviado em {new Date(p.created_at).toLocaleDateString('pt-BR')}
      </p>

      {cancelado ? (
        <div className="mt-5 bg-[#EEEDE7] border-l-4 border-[#6E6E68] rounded-r-sm p-4">
          <p className="font-semibold tracking-tight">Pedido cancelado</p>
          {p.cancelado_motivo && (
            <p className="text-sm text-[#131A2E] mt-1.5 leading-relaxed">
              {p.cancelado_motivo}
            </p>
          )}
        </div>
      ) : (
        <div
          className="mt-5 rounded-sm px-4 py-3.5 text-white flex items-baseline gap-3 flex-wrap"
          style={{
            background: aguardando
              ? 'linear-gradient(103deg,#0090D8 0%,#0070A8 100%)'
              : 'linear-gradient(103deg,#B00063 0%,#B4005F 100%)',
          }}
        >
          <span className="text-[10px] tracking-[0.16em] text-white/60">
            ETAPA ATUAL
          </span>
          <span className="font-bold tracking-tight">{ROTULOS[atual]}</span>
        </div>
      )}

      {aguardando && !cancelado && (
        <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
          Seu pedido foi recebido e está sendo conferido pela Bello Tecido.
          Enquanto não confirmado, você ainda pode cancelá-lo.
        </p>
      )}

      {recusada && (
        <div className="mt-4 bg-[#EEEDE7] border border-[#DDDCD5] rounded-sm p-4">
          <p className="text-sm font-semibold tracking-tight">
            Cancelamento não atendido
          </p>
          {recusada.resposta && (
            <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
              {recusada.resposta}
            </p>
          )}
        </div>
      )}

      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
        ANDAMENTO
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>

      <ol className="relative pl-6">
        <span className="absolute left-1.5 top-2 bottom-4 w-0.5 bg-[#131A2E]" />
        {hist.map((h: any, idx: number) => {
          const agora = idx === hist.length - 1 && !cancelado
          const azul = agora && h.status === 'aguardando'
          return (
            <li key={`${h.status}-${h.created_at}`} className="relative pb-5">
              <span
                className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 ${
                  azul
                    ? 'bg-[#0090D8] border-[#0090D8] ring-4 ring-[#0090D8]/15'
                    : agora
                    ? 'bg-[#B00063] border-[#B00063] ring-4 ring-[#B00063]/15'
                    : 'bg-[#131A2E] border-[#131A2E]'
                }`}
              />
              <div
                className={`text-sm font-semibold tracking-tight ${
                  azul
                    ? 'text-[#0090D8]'
                    : agora
                    ? 'text-[#B00063]'
                    : 'text-[#131A2E]'
                }`}
              >
                {ROTULOS[h.status] ?? h.status}
              </div>
              <div className="text-[10px] font-mono text-[#6E6E68] mt-0.5">
                {dataHora(h.created_at)}
              </div>
            </li>
          )
        })}
      </ol>

      {temAjuste && ajuste && (
        <div className="bg-[#FFF6FA] border border-[#B00063] rounded-sm p-4 mt-4">
          <p className="font-semibold tracking-tight text-sm">
            Quantidade ajustada
          </p>
          <p className="text-sm mt-1.5 leading-relaxed">{ajuste.motivo}</p>
        </div>
      )}

      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
        ITENS
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>

      <div className="space-y-2">
        {itens.map((i) => {
          const mudou = i.quantidade_faturada !== i.quantidade_pedida
          const unitario =
            Number(i.preco_unitario) * Number(i.metros_por_unidade)
          const img = urls.get(i.produto_id)

          return (
            <div
              key={i.id}
              className="bg-white border border-[#DDDCD5] rounded-sm p-3 flex gap-3"
            >
              {img ? (
                <img
                  src={img}
                  alt={i.nome}
                  className="w-14 h-14 object-cover rounded-sm shrink-0"
                />
              ) : (
                <div className="w-14 h-14 bg-[#EEEDE7] rounded-sm shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-[#131A2E]">{i.sku}</div>
                <div className="font-semibold tracking-tight text-sm mt-0.5">
                  {i.nome}
                </div>
                <div className="text-xs text-[#6E6E68] mt-0.5">
                  {mudou && (
                    <s className="opacity-60 mr-1">{i.quantidade_pedida}</s>
                  )}
                  <span className={mudou ? 'text-[#B00063] font-semibold' : ''}>
                    {i.quantidade_faturada} un
                  </span>{' '}
                  × R$ {brl(unitario)} · {i.tecido}
                </div>
              </div>

              <div className="text-right whitespace-nowrap">
                <div className="font-mono font-semibold text-sm">
                  R$ {brl(Number(i.subtotal))}
                </div>
                <div className="text-[10px] font-mono text-[#6E6E68]">
                  {brl(Number(i.metros_total))} m
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {p.notas && (
        <>
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
            SUAS NOTAS
            <span className="flex-1 h-px bg-[#DDDCD5]" />
          </h2>
          <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 text-sm leading-relaxed">
            {p.notas}
          </div>
        </>
      )}

      <div className="mt-6 border-t-2 border-[#131A2E] pt-4">
        <div className="flex justify-between items-baseline text-sm text-[#6E6E68]">
          <span>Metragem total</span>
          <span className="font-mono">{brl(metrosTotal)} m</span>
        </div>
        <div className="flex justify-between items-baseline mt-2">
          <span className="font-semibold tracking-tight">TOTAL</span>
          <strong className="font-mono text-2xl">
            R$ {brl(Number(p.total))}
          </strong>
        </div>
      </div>

      {!cancelado && (
        <AcoesCliente
          pedidoId={p.id}
          numero={Number(p.numero)}
          aguardando={aguardando}
          temSolicitacao={!!aberta}
          podeSolicitar={podeSolicitar}
        />
      )}
    </div>
  )
}