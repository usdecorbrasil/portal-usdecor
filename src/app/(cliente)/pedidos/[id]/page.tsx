import Link from 'next/link'
import { notFound } from 'next/navigation'
import BotaoVoltar from '@/components/botao-voltar'
import { createClient } from '@/lib/supabase/server'
import AcoesCliente from './acoes-cliente'
import { taxaDoPedido } from '@/lib/pagamento/config'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ROTULOS: Record<string, string> = {
  aguardando: 'Aguardando confirmação',
  recebido: 'Pedido confirmado',
  impressao: 'Impressão',
  estampando: 'Estampando',
  pronto: 'Estampa pronta',
  faturado: 'Faturado',
  nf_emitida: 'Nota fiscal emitida',
  corte_costura: 'Em corte / costura',
  expedido: 'Expedido',
  entregue: 'Entregue',
  fechado: 'Pedido fechado',
}

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

const ORDEM = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'pronto',
  'faturado', 'nf_emitida', 'corte_costura', 'expedido', 'entregue', 'fechado',
]

function dataHora(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

function dataBr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
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
      forma_pagamento, parcelas_solicitadas, metragem_impressa,
      taxa_pagamento_percentual, taxa_pagamento_fixa,
      link_pagamento, pago_em, link_boleto, link_pix,
      pedido_itens(
        id, produto_id, sku, nome,
        quantidade_pedida, quantidade_faturada
      ),
      pedido_status_historico(status, created_at),
      pedido_ajustes(motivo, created_at),
      pedido_solicitacoes(id, texto, status, resposta, created_at),
      pedido_parcelas(numero, valor, vencimento, pago_em, link_boleto, link_pix)
    `)
    .eq('id', id)
    .single()

  if (!pedido) notFound()

  const p = pedido as any
  const itens = (p.pedido_itens ?? []) as any[]
  const parcelas = ((p.pedido_parcelas ?? []) as any[]).sort(
    (a, b) => a.numero - b.numero
  )

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

  // Valor só é exibido ao cliente a partir de "Pedido pronto"
  const liberadoValor = ORDEM.indexOf(atual) >= ORDEM.indexOf('pronto')
  // Forma de pagamento é decisão da equipe no faturamento: antes disso o
  // cliente não vê nada sobre ela
  const faturado = ORDEM.indexOf(atual) >= ORDEM.indexOf('faturado') && !!p.forma_pagamento

  // `total` é a mercadoria; a forma de pagamento pode acrescentar taxa
  const taxa = taxaDoPedido(
    Number(p.total),
    Number(p.taxa_pagamento_percentual ?? 0),
    Number(p.taxa_pagamento_fixa ?? 0),
    p.forma_pagamento,
    parcelas.length || Number(p.parcelas_solicitadas ?? 1)
  )
  const totalCobrado = Math.round((Number(p.total) + taxa) * 100) / 100

  const solicitacoes = (p.pedido_solicitacoes ?? []) as any[]
  const aberta = solicitacoes.find((s) => s.status === 'aberta')
  const recusada = solicitacoes.find((s) => s.status === 'recusada')

  // Só enquanto o pedido está confirmado e ainda não entrou em produção:
  // depois disso já há papel impresso, e cancelar vira conversa com a equipe
  const podeSolicitar = !cancelado && atual === 'recebido'

  const unidadesTotal = itens.reduce(
    (a, i) => a + Number(i.quantidade_faturada),
    0
  )

  // Cobrança: o que o cliente pode fazer agora. Pago encerra o assunto;
  // cartão paga pelo link que a equipe enviou; boleto/Pix pelos links do
  // Bling, por parcela (parcelado) ou no pedido (à vista)
  const pagoEm = (p.pago_em as string | null) ?? null
  const ehCartao = String(p.forma_pagamento ?? '').startsWith('cartao')
  const linkCartao = ehCartao && !pagoEm ? ((p.link_pagamento as string | null) ?? null) : null
  const linkBoletoAvista = !pagoEm && parcelas.length === 0 ? ((p.link_boleto as string | null) ?? null) : null
  const linkPixAvista = !pagoEm && parcelas.length === 0 ? ((p.link_pix as string | null) ?? null) : null
  // Metragem real, informada ao finalizar a estampa
  const metrosTotal =
    p.metragem_impressa != null ? Number(p.metragem_impressa) : null
  const temAjuste = itens.some(
    (i) => i.quantidade_faturada !== i.quantidade_pedida
  )

  return (
    <div>
      <BotaoVoltar href="/pedidos" rotulo="PEDIDOS" />

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
          Seu pedido foi recebido e está sendo conferido pela Best Color Tecidos.
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

      {faturado && (
      <>
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
        FORMA DE PAGAMENTO
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold tracking-tight text-sm">
            {ROTULOS_PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}
          </span>
          {parcelas.length > 1 && (
            <span className="text-xs font-mono text-[#6E6E68]">{parcelas.length}x</span>
          )}
        </div>

        {parcelas.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#DDDCD5] space-y-1.5">
            {parcelas.map((pc) => (
              <div
                key={pc.numero}
                className="flex items-center justify-between gap-2 text-xs bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
              >
                <span className="font-mono text-[#6E6E68]">
                  {pc.numero}/{parcelas.length}
                </span>
                {liberadoValor && (
                  <span className="font-mono">{brl(Number(pc.valor))}</span>
                )}
                <span className="text-[#6E6E68]">
                  venc. {dataBr(pc.vencimento)}
                </span>
                {!pc.pago_em && liberadoValor && (pc.link_boleto || pc.link_pix) && (
                  <span className="flex gap-2">
                    {pc.link_boleto && (
                      <a href={pc.link_boleto} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">
                        boleto
                      </a>
                    )}
                    {pc.link_pix && (
                      <a href={pc.link_pix} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">
                        Pix
                      </a>
                    )}
                  </span>
                )}
                <ParcelaBadge vencimento={pc.vencimento} pagoEm={pc.pago_em} />
              </div>
            ))}
          </div>
        )}

        {pagoEm && (
          <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
            <p className="text-sm font-semibold tracking-tight text-[#2E7D4F]">
              Pagamento confirmado em {new Date(pagoEm).toLocaleDateString('pt-BR')}
            </p>
          </div>
        )}

        {linkCartao && liberadoValor && (
          <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
            <a
              href={linkCartao}
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center bg-[#D8007A] text-white rounded-sm py-3 text-sm font-bold tracking-wider hover:bg-[#B00063]"
            >
              PAGAR COM CARTÃO
            </a>
            <p className="text-[11px] text-[#6E6E68] mt-2 leading-relaxed">
              Abre a página de pagamento em uma nova aba. A confirmação aparece
              aqui assim que o pagamento for identificado.
            </p>
          </div>
        )}

        {ehCartao && !linkCartao && !pagoEm && liberadoValor && (
          <p className="text-xs text-[#6E6E68] mt-3 pt-3 border-t border-[#DDDCD5] leading-relaxed">
            O link de pagamento será enviado por e-mail e aparecerá aqui.
          </p>
        )}

        {(linkBoletoAvista || linkPixAvista) && liberadoValor && (
          <div className="mt-3 pt-3 border-t border-[#DDDCD5] flex flex-wrap gap-2">
            {linkBoletoAvista && (
              <a
                href={linkBoletoAvista}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide hover:bg-[#131A2E] hover:text-white"
              >
                ABRIR BOLETO
              </a>
            )}
            {linkPixAvista && (
              <a
                href={linkPixAvista}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide hover:bg-[#131A2E] hover:text-white"
              >
                PAGAR COM PIX
              </a>
            )}
          </div>
        )}
      </div>
      </>
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
              </div>

              <div className="text-right whitespace-nowrap">
                {mudou && (
                  <s className="text-xs text-[#6E6E68] opacity-60 mr-1">
                    {i.quantidade_pedida}
                  </s>
                )}
                <span
                  className={`text-sm font-semibold font-mono ${
                    mudou ? 'text-[#B00063]' : 'text-[#131A2E]'
                  }`}
                >
                  {i.quantidade_faturada} un
                </span>
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
          <span className="font-semibold tracking-tight">Quantidade total</span>
          <strong className="font-mono text-2xl">{unidadesTotal} un</strong>
        </div>

        {metrosTotal !== null && (
          <div className="flex justify-between items-baseline text-sm text-[#6E6E68] mt-2">
            <span>Metragem impressa</span>
            <span className="font-mono">{brl(metrosTotal)} m</span>
          </div>
        )}

        {liberadoValor ? (
          <>
            {taxa > 0 && (
              <>
                <div className="flex justify-between items-baseline text-sm text-[#6E6E68] mt-2">
                  <span>Produtos</span>
                  <span className="font-mono">R$ {brl(Number(p.total))}</span>
                </div>
                <div className="flex justify-between items-baseline text-sm text-[#6E6E68]">
                  <span>{ROTULOS_PAGAMENTO[p.forma_pagamento] ?? 'Pagamento'}</span>
                  <span className="font-mono">+ R$ {brl(taxa)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-baseline mt-2">
              <span className="font-semibold tracking-tight">TOTAL</span>
              <strong className="font-mono text-2xl">
                R$ {brl(totalCobrado)}
              </strong>
            </div>
          </>
        ) : (
          <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
            O valor será informado após finalizar a estampa, com base na
            metragem realmente impressa. A forma de pagamento é combinada com
            a equipe nesse momento.
          </p>
        )}
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

function ParcelaBadge({
  vencimento,
  pagoEm,
}: {
  vencimento: string
  pagoEm: string | null
}) {
  if (pagoEm) {
    const atrasou = new Date(pagoEm) > new Date(vencimento + 'T23:59:59')
    return (
      <span className={atrasou ? 'text-[#C79600]' : 'text-[#2E7D4F]'}>
        pago
      </span>
    )
  }

  const venceu = new Date(vencimento) < new Date(new Date().toDateString())
  if (venceu) {
    return <span className="text-[#B00063] font-semibold">vencido</span>
  }

  return <span className="text-[#6E6E68]">aguardando</span>
}