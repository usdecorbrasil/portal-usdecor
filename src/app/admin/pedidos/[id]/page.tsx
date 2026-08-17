import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import PainelAcoes from './painel-acoes'

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

const ORIGENS: Record<string, string> = {
  sistema: 'automático',
  admin: 'painel',
  bling: 'Bling',
}

function dataHora(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

export default async function PedidoAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const perfil = await lerPerfil()

  if (!perfil || perfil.papel === 'cliente') redirect('/')

  const dono = perfil.veValores
  const supabase = await createClient()

  const camposItens = dono
    ? `id, produto_id, sku, nome, tecido, preco_unitario, metros_por_unidade,
       quantidade_pedida, quantidade_faturada, metros_total, subtotal`
    : `id, produto_id, sku, nome, tecido, metros_por_unidade,
       quantidade_pedida, quantidade_faturada, metros_total`

  const camposFinanceiros = dono
    ? `total, bling_pedido_id, bling_numero, bling_sync_status,
       nf_numero, nf_emitida_em,
       boleto_linha, boleto_vencimento, boleto_emitido_em,
       baixa_financeira_em,`
    : ''

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(`
      id, numero, notas, created_at,
      cancelado_em, cancelado_motivo,
      ${camposFinanceiros}
      clientes(razao_social, cnpj),
      pedido_itens(${camposItens}),
      pedido_status_historico(
        status, origem, created_at, observacao,
        reimpressao_motivo, reimpressao_custo
      ),
      pedido_ajustes(motivo, quantidade_de, quantidade_para, created_at),
      pedido_solicitacoes(id, texto, status, resposta, created_at)
    `)
    .eq('id', id)
    .single()

  if (!pedido) notFound()

  const p = pedido as any
  const cliente = p.clientes as { razao_social: string; cnpj: string }
  const itens = (p.pedido_itens ?? []) as any[]

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
  const usados = hist.map((h: any) => h.status)
  const cancelado = !!p.cancelado_em
  const aguardando = atual === 'aguardando'
  const reimpressoes = hist.filter((h: any) => h.reimpressao_motivo).length
  const metrosTotal = itens.reduce((a, i) => a + Number(i.metros_total), 0)
  const ajustes = (p.pedido_ajustes ?? []) as any[]

  const solicitacoes = (p.pedido_solicitacoes ?? []) as any[]
  const aberta = solicitacoes.find((s) => s.status === 'aberta')
  const respondidas = solicitacoes.filter((s) => s.status !== 'aberta')

  return (
    <div>
      <Link
        href="/admin/pedidos"
        className="text-xs tracking-widest text-[#6E6E68] hover:text-[#131A2E]"
      >
        ← PEDIDOS
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] mt-3">
        Pedido #{p.numero}
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1">
        {cliente.razao_social} ·{' '}
        {new Date(p.created_at).toLocaleDateString('pt-BR')}
      </p>

      {dono && !aguardando && (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
          <h2 className="font-semibold tracking-tight text-sm mb-3">Bling</h2>
          <Linha rotulo="Pedido de venda" valor={p.bling_numero ?? '—'} mono />
          <Linha
            rotulo="Sincronização"
            valor={
              p.bling_sync_status === 'enviado'
                ? 'enviado'
                : p.bling_sync_status === 'erro'
                ? 'erro'
                : 'pendente'
            }
          />
          <Linha
            rotulo="Nota fiscal"
            valor={p.nf_numero ? `emitida · ${p.nf_numero}` : 'aguardando'}
          />
          <Linha
            rotulo="Boleto"
            valor={p.boleto_emitido_em ? 'emitido' : 'não emitido'}
          />
          <Linha
            rotulo="Baixa financeira"
            valor={
              p.baixa_financeira_em
                ? new Date(p.baixa_financeira_em).toLocaleDateString('pt-BR')
                : 'aguardando'
            }
          />
        </div>
      )}

      {cancelado ? (
        <div className="mt-5 bg-[#EEEDE7] border-l-4 border-[#6E6E68] rounded-r-sm p-4">
          <p className="font-semibold tracking-tight">Pedido cancelado</p>
          {p.cancelado_motivo && (
            <p className="text-sm mt-1.5 leading-relaxed">
              {p.cancelado_motivo}
            </p>
          )}
          <p className="text-[10px] font-mono tracking-widest text-[#6E6E68] mt-2 uppercase">
            {dataHora(p.cancelado_em)}
          </p>
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
          {reimpressoes > 0 && (
            <span className="text-[10px] font-mono bg-white/20 rounded-sm px-2 py-0.5">
              {reimpressoes}ª reimpressão
            </span>
          )}
        </div>
      )}

      {!cancelado && (
        <PainelAcoes
          pedidoId={p.id}
          numero={Number(p.numero)}
          cliente={cliente.razao_social}
          statusAtual={atual}
          usados={usados}
          total={dono ? Number(p.total) : 0}
          reimpressoes={reimpressoes}
          podeCancelarOuAjustar={dono}
          solicitacao={
            aberta
              ? {
                  id: aberta.id,
                  texto: aberta.texto,
                  criadoEm: aberta.created_at,
                }
              : null
          }
          itens={itens.map((i) => ({
            id: i.id,
            sku: i.sku,
            nome: i.nome,
            pedida: i.quantidade_pedida,
            faturada: i.quantidade_faturada,
            precoMetro: dono ? Number(i.preco_unitario) : 0,
            metrosPorUnidade: Number(i.metros_por_unidade),
            imagemUrl: urls.get(i.produto_id) ?? null,
          }))}
        />
      )}

      <Titulo>ANDAMENTO</Titulo>

      <ol className="relative pl-6">
        <span className="absolute left-1.5 top-2 bottom-4 w-0.5 bg-[#131A2E]" />
        {hist.map((h: any, idx: number) => {
          const agora = idx === hist.length - 1 && !cancelado
          return (
            <li key={`${h.status}-${h.created_at}`} className="relative pb-5">
              <span
                className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 ${
                  h.reimpressao_motivo
                    ? 'bg-white border-[#C79600]'
                    : agora
                    ? h.status === 'aguardando'
                      ? 'bg-[#0090D8] border-[#0090D8] ring-4 ring-[#0090D8]/15'
                      : 'bg-[#B00063] border-[#B00063] ring-4 ring-[#B00063]/15'
                    : 'bg-[#131A2E] border-[#131A2E]'
                }`}
              />
              <div
                className={`text-sm font-semibold tracking-tight ${
                  agora
                    ? h.status === 'aguardando'
                      ? 'text-[#0090D8]'
                      : 'text-[#B00063]'
                    : 'text-[#131A2E]'
                }`}
              >
                {ROTULOS[h.status] ?? h.status}
              </div>
              <div className="text-[10px] font-mono text-[#6E6E68] mt-0.5">
                {dataHora(h.created_at)}
                <span className="ml-1.5 border border-[#DDDCD5] rounded-sm px-1.5 py-0.5 uppercase tracking-wider">
                  {ORIGENS[h.origem] ?? h.origem}
                </span>
              </div>
              {h.reimpressao_motivo && (
                <div className="inline-block text-[11px] leading-snug text-[#C79600] bg-[#FBF0D9] rounded-sm px-2 py-1 mt-1.5">
                  Reimpressão · {h.reimpressao_motivo}{' '}
                  <b>
                    (
                    {h.reimpressao_custo === 'interno'
                      ? 'custo interno'
                      : 'custo do cliente'}
                    )
                  </b>
                </div>
              )}
              {h.observacao && (
                <div className="text-[11px] text-[#6E6E68] mt-1">
                  {h.observacao}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {respondidas.length > 0 && (
        <>
          <Titulo>SOLICITAÇÕES DO CLIENTE</Titulo>
          <div className="space-y-2">
            {respondidas.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-[#DDDCD5] rounded-sm p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold tracking-tight">
                    Cancelamento
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                      s.status === 'aceita'
                        ? 'bg-[#E3F0E8] text-[#2E7D4F]'
                        : 'bg-[#EAE9E3] text-[#6E6E68]'
                    }`}
                  >
                    {s.status === 'aceita' ? 'aceita' : 'recusada'}
                  </span>
                </div>
                <p className="text-sm italic text-[#6E6E68] mt-1.5 leading-relaxed">
                  &ldquo;{s.texto}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {ajustes.length > 0 && (
        <>
          <Titulo>AJUSTES DE QUANTIDADE</Titulo>
          <div className="space-y-2">
            {ajustes.map((a, i) => (
              <div
                key={i}
                className="bg-[#FFF6FA] border border-[#B00063] rounded-sm p-3"
              >
                <p className="text-sm leading-relaxed">{a.motivo}</p>
                <p className="text-[10px] font-mono text-[#6E6E68] mt-1.5 uppercase tracking-wider">
                  {a.quantidade_de} → {a.quantidade_para} un ·{' '}
                  {dataHora(a.created_at)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <Titulo>ITENS</Titulo>

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
                <div className="text-xs text-[#6E6E68] mt-0.5">
                  {mudou && (
                    <s className="opacity-60 mr-1">{i.quantidade_pedida}</s>
                  )}
                  <span className={mudou ? 'text-[#B00063] font-semibold' : ''}>
                    {i.quantidade_faturada} un
                  </span>
                  {dono &&
                    ` × R$ ${brl(
                      Number(i.preco_unitario) * Number(i.metros_por_unidade)
                    )}`}{' '}
                  · {i.tecido}
                </div>
              </div>

              <div className="text-right whitespace-nowrap">
                {dono && (
                  <div className="font-mono font-semibold text-sm">
                    R$ {brl(Number(i.subtotal))}
                  </div>
                )}
                <div
                  className={`font-mono text-[#6E6E68] ${
                    dono ? 'text-[10px]' : 'text-sm font-semibold text-[#131A2E]'
                  }`}
                >
                  {brl(Number(i.metros_total))} m
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {p.notas && (
        <>
          <Titulo>NOTAS DO CLIENTE</Titulo>
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
        {dono && (
          <div className="flex justify-between items-baseline mt-2">
            <span className="font-semibold tracking-tight">TOTAL</span>
            <strong className="font-mono text-2xl">
              R$ {brl(Number(p.total))}
            </strong>
          </div>
        )}
      </div>
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

function Linha({
  rotulo,
  valor,
  mono = false,
}: {
  rotulo: string
  valor: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-[#6E6E68]">{rotulo}</span>
      <span className={mono ? 'font-mono text-xs self-center' : ''}>{valor}</span>
    </div>
  )
}