import { notFound, redirect } from 'next/navigation'

// As ações desta tela falam com o Bling e com o Resend; o padrão da
// Vercel é curto demais para isso
export const maxDuration = 60
import BotaoVoltar from '@/components/botao-voltar'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import {
  buscarMaxParcelas,
  buscarValorMinimoBoleto,
  buscarConfigPagamento,
} from '@/app/actions/configuracoes'
import PainelAcoes from './painel-acoes'
import ReenviarBling from './reenviar-bling'
import Faturamento, { type CobrancaLinha } from './faturamento'
import { urlDocumento } from '@/lib/storage/documentos'
import { taxaDoPedido } from '@/lib/pagamento/config'
import NotaFiscal from './nota-fiscal'

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

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

function rotuloForma(forma: string, parcelas: number | null) {
  const label = ROTULOS_PAGAMENTO[forma] ?? forma
  return forma === 'boleto_parcelado' && parcelas ? `${label} (${parcelas}x)` : label
}

function dataHora(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

/** `null` é pedido anterior à decisão existir — e antes dela todos tinham nota. */
const rotuloNf = (v: boolean | null) => (v === false ? 'Sem nota' : 'Com nota')

function dataBr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
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
    ? `id, produto_id, sku, nome, preco_unitario,
       quantidade_pedida, quantidade_faturada`
    : `id, produto_id, sku, nome,
       quantidade_pedida, quantidade_faturada`

  const camposFinanceiros = dono ? `total,` : ''

  // Anotado como `string` de propósito: sem isso o TypeScript tenta montar o
  // tipo do retorno a partir do texto da consulta, e com esta quantidade de
  // tabelas embutidas a união fica grande demais para ele representar.
  // O retorno já é tratado como `any` logo abaixo.
  const campos: string = `
      id, numero, notas, created_at, metragem_impressa,
      cancelado_em, cancelado_motivo, cancelado_por,
      bling_pedido_id, bling_numero, bling_sync_status, bling_erro,
      bling_nf_id, nf_numero, nf_chave, nf_emitida_em, nf_pdf_path, nf_xml_path, nf_link_danfe,
      link_boleto, link_pix, boleto_pdf_path, cobranca_gerada_em,
      forma_pagamento, parcelas_solicitadas, cliente_id,
      emitir_nf, emitir_nf_motivo,
      taxa_pagamento_percentual, taxa_pagamento_fixa,
      ${camposFinanceiros}
      clientes(razao_social, cnpj, preco_metro),
      pedido_itens(${camposItens}),
      pedido_status_historico(
        status, origem, created_at, observacao,
        reimpressao_motivo, reimpressao_custo, criado_por
      ),
      pedido_ajustes(
        motivo, item_id, quantidade_de, quantidade_para, created_at, criado_por
      ),
      pedido_forma_pagamento_historico(
        forma_anterior, forma_nova, parcelas_anterior, parcelas_nova, motivo,
        criado_em, autor_id
      ),
      pedido_precos(preco_de, preco_para, motivo, created_at, criado_por),
      pedido_nf_historico(emitir_de, emitir_para, motivo, created_at, criado_por),
      pedido_metragem_historico(metragem_de, metragem_para, motivo, created_at, criado_por),
      pedido_solicitacoes(id, texto, status, resposta, created_at),
      pedido_parcelas(numero, valor, vencimento, pago_em, link_boleto, link_pix, boleto_pdf_path)
    `

  // As configurações não dependem do pedido: buscar em paralelo
  const [{ data: pedido, error }, maxParcelas, valorMinimoBoleto, configPagamento] =
    await Promise.all([
      supabase.from('pedidos').select(campos).eq('id', id).single(),
      buscarMaxParcelas(),
      buscarValorMinimoBoleto(),
      buscarConfigPagamento(),
    ])

  // Só "nenhuma linha" é 404. Qualquer outra falha da consulta (permissão,
  // tabela embutida sem grant, coluna inexistente) precisa aparecer como erro
  // — virar 404 já escondeu um "permission denied" por horas
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Falha ao carregar o pedido: ${error.message}`)
  }

  if (!pedido) notFound()

  const p = pedido as any
  const cliente = p.clientes as {
    razao_social: string
    cnpj: string
    preco_metro: number
  }
  
  const itens = (p.pedido_itens ?? []) as any[]
  const parcelas = ((p.pedido_parcelas ?? []) as any[]).sort(
    (a, b) => a.numero - b.numero
  )

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
  // A metragem real vem do romaneio, não da soma dos itens
  const metrosTotal =
    p.metragem_impressa != null ? Number(p.metragem_impressa) : 0
  const unidadesTotal = itens.reduce(
    (a, i) => a + Number(i.quantidade_faturada),
    0
  )
  const antesDoEstampando = ['aguardando', 'recebido', 'impressao'].includes(atual)

  // Faturamento: só o dono, e só depois de o pedido existir no Bling
  const mostrarFaturamento = dono && usados.includes('pronto') && !!p.bling_pedido_id

  const nf = p.nf_numero
    ? {
        numero: String(p.nf_numero),
        chave: (p.nf_chave as string | null) ?? null,
        emitidaEm: String(p.nf_emitida_em ?? p.created_at),
        pdfUrl: mostrarFaturamento ? await urlDocumento(p.nf_pdf_path) : null,
        xmlUrl: mostrarFaturamento ? await urlDocumento(p.nf_xml_path) : null,
        linkDanfe: (p.nf_link_danfe as string | null) ?? null,
      }
    : null

  // Parcelado: uma linha por parcela; à vista: uma linha com o que ficou no pedido
  const linhasCobranca: CobrancaLinha[] = mostrarFaturamento
    ? parcelas.length > 0
      ? await Promise.all(
          parcelas.map(async (pc) => ({
            numero: Number(pc.numero),
            valor: Number(pc.valor),
            vencimento: String(pc.vencimento).slice(0, 10),
            linkBoleto: (pc.link_boleto as string | null) ?? null,
            linkPix: (pc.link_pix as string | null) ?? null,
            pdfUrl: await urlDocumento(pc.boleto_pdf_path),
          }))
        )
      : p.link_boleto || p.link_pix
        ? [
            {
              numero: 1,
              valor: Number(p.total),
              vencimento: String(p.cobranca_gerada_em ?? p.created_at).slice(0, 10),
              linkBoleto: (p.link_boleto as string | null) ?? null,
              linkPix: (p.link_pix as string | null) ?? null,
              pdfUrl: await urlDocumento(p.boleto_pdf_path),
            },
          ]
        : []
    : []

  // Quanto vale cada boleto: a menor parcela, ou o valor cobrado inteiro no
  // à vista. É o que a tela compara com o mínimo ao fechar a produção
  const valorDocumentoBoleto =
    dono && String(p.forma_pagamento ?? '').startsWith('boleto') && Number(p.total) > 0
      ? parcelas.length > 0
        ? Math.min(...parcelas.map((x) => Number(x.valor)))
        : Number(p.total) +
          taxaDoPedido(
            Number(p.total),
            Number(p.taxa_pagamento_percentual ?? 0),
            Number(p.taxa_pagamento_fixa ?? 0),
            p.forma_pagamento,
            1
          )
      : null
  const notaEmitida = usados.some((s: string) =>
    ['nf_emitida', 'expedido', 'entregue', 'fechado'].includes(s)
  )
  const ajustesQtd = (p.pedido_ajustes ?? []) as any[]
  const ajustesForma = (p.pedido_forma_pagamento_historico ?? []) as any[]
  const ajustesPreco = (p.pedido_precos ?? []) as any[]
  const ajustesNf = (p.pedido_nf_historico ?? []) as any[]
  const ajustesMetragem = (p.pedido_metragem_historico ?? []) as any[]
  const itemPorId = new Map(itens.map((i) => [i.id, i]))

  // Quem fez cada coisa, numa consulta só. Degrada para nada quando o perfil
  // foi arquivado ou a política não deixa ler — nome é informação extra, não
  // pode derrubar a tela do pedido
  const idsAutores = [
    ...ajustesQtd.map((a) => a.criado_por),
    ...ajustesForma.map((a) => a.autor_id),
    ...ajustesPreco.map((a) => a.criado_por),
    ...ajustesNf.map((a) => a.criado_por),
    ...ajustesMetragem.map((a) => a.criado_por),
    ...hist.map((h: any) => h.criado_por),
    p.cancelado_por,
  ].filter(Boolean) as string[]

  const nomes = new Map<string, string>()

  if (idsAutores.length) {
    const { data: perfis } = await supabase
      .from('profiles')
      .select('id, nome')
      .in('id', [...new Set(idsAutores)])

    perfis?.forEach((x) => {
      if (x.nome) nomes.set(x.id as string, x.nome as string)
    })
  }

  const autorDe = (id: string | null | undefined) =>
    (id && nomes.get(id)) || null

  const alteracoes = [
    ...ajustesQtd.map((a) => {
      const item = itemPorId.get(a.item_id)
      const produto = item ? `${item.sku} — ${item.nome}: ` : ''
      return {
        // Item novo entra como 0 → N; chamar isso de "quantidade" escondia o
        // que de fato aconteceu
        tipo: a.quantidade_de === 0 ? 'Item adicionado' : 'Quantidade',
        motivo: a.motivo as string,
        detalhe: `${produto}${a.quantidade_de} → ${a.quantidade_para} un`,
        data: a.created_at as string,
        autor: autorDe(a.criado_por),
      }
    }),
    ...ajustesForma.map((a) => ({
      tipo: 'Forma de pagamento',
      motivo: a.motivo as string,
      detalhe:
        a.forma_anterior === a.forma_nova
          ? `${a.parcelas_anterior}x → ${a.parcelas_nova}x`
          : `${rotuloForma(a.forma_anterior, a.parcelas_anterior)} → ${rotuloForma(
              a.forma_nova,
              a.parcelas_nova
            )}`,
      data: a.criado_em as string,
      autor: autorDe(a.autor_id),
    })),
    ...ajustesPreco.map((a) => ({
      tipo: 'Preço',
      motivo: a.motivo as string,
      detalhe:
        dono && !antesDoEstampando
          ? `R$ ${brl(Number(a.preco_de))} → R$ ${brl(Number(a.preco_para))} /m`
          : 'Preço por metro alterado',
      data: a.created_at as string,
      autor: autorDe(a.criado_por),
    })),
    ...ajustesMetragem.map((a) => ({
      tipo: 'Metragem',
      motivo: a.motivo as string,
      detalhe: `${brl(Number(a.metragem_de ?? 0))} m → ${brl(Number(a.metragem_para))} m`,
      data: a.created_at as string,
      autor: autorDe(a.criado_por),
    })),
    ...ajustesNf.map((a) => ({
      tipo: 'Nota fiscal',
      motivo:
        (a.motivo as string | null) ??
        (a.emitir_para
          ? 'Pedido voltou a sair com nota fiscal.'
          : 'Pedido passou a sair sem nota fiscal.'),
      detalhe: `${rotuloNf(a.emitir_de)} → ${rotuloNf(a.emitir_para)}`,
      data: a.created_at as string,
      autor: autorDe(a.criado_por),
    })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const solicitacoes = (p.pedido_solicitacoes ?? []) as any[]
  const aberta = solicitacoes.find((s) => s.status === 'aberta')
  const respondidas = solicitacoes.filter((s) => s.status !== 'aberta')

  return (
    <div>
      <BotaoVoltar href="/admin/pedidos" rotulo="PEDIDOS" />

      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] mt-3">
        Pedido #{p.numero}
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1">
        {cliente.razao_social} ·{' '}
        {new Date(p.created_at).toLocaleDateString('pt-BR')}
      </p>

      {/* Sem isto, uma falha de sincronia com o ERP passaria despercebida —
          e "pendente" depois de pronto é falha também: o envio morreu no meio */}
      {dono && !cancelado && usados.includes('pronto') && p.bling_sync_status !== 'enviado' && (
        <ReenviarBling pedidoId={p.id} erro={p.bling_erro ?? null} />
      )}

      {dono && p.bling_pedido_id && !mostrarFaturamento && (
        <p className="text-[11px] font-mono text-[#6E6E68] mt-2">
          Bling: pedido {p.bling_numero ? '#' + p.bling_numero : p.bling_pedido_id}
        </p>
      )}

      {mostrarFaturamento && (
        <Faturamento
          pedidoId={p.id}
          blingNumero={p.bling_numero ? String(p.bling_numero) : null}
          emitirNf={p.emitir_nf !== false}
          nf={nf}
          formaPagamento={String(p.forma_pagamento ?? '')}
          cobranca={{
            geradaEm: (p.cobranca_gerada_em as string | null) ?? null,
            linhas: linhasCobranca,
          }}
        />
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
            {autorDe(p.cancelado_por) && ` · por ${autorDe(p.cancelado_por)}`}
          </p>
          {/* Divergência com o ERP não pode ficar escondida num pedido morto */}
          {dono && p.bling_erro && (
            <p className="text-xs text-[#B00063] mt-2 leading-relaxed">{p.bling_erro}</p>
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
          {reimpressoes > 0 && (
            <span className="text-[10px] font-mono bg-white/20 rounded-sm px-2 py-0.5">
              {reimpressoes}ª reimpressão
            </span>
          )}
        </div>
      )}

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
              </div>

              <div className="text-right whitespace-nowrap">
                <span
                  className={`font-mono font-semibold text-sm ${
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
          <Titulo>NOTAS DO CLIENTE</Titulo>
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

        {antesDoEstampando ? (
          <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
            O valor deste pedido é definido ao finalizar a estampa, com a
            metragem realmente impressa.
          </p>
        ) : (
          <>
            <div className="flex justify-between items-baseline text-sm text-[#6E6E68] mt-2">
              <span>Metragem impressa</span>
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
          </>
        )}
      </div>

      {!cancelado && (
        <PainelAcoes
          pedidoId={p.id}
          numero={Number(p.numero)}
          cliente={cliente.razao_social}
          clienteId={p.cliente_id}
          statusAtual={atual}
          usados={usados}
          total={dono ? Number(p.total) : 0}
          reimpressoes={reimpressoes}
          podeCancelarOuAjustar={dono}
          formaPagamento={p.forma_pagamento}
          emitirNf={p.emitir_nf !== false}
          parcelasSolicitadas={p.parcelas_solicitadas}
          parcelasAtuais={parcelas.length}
          maxParcelas={maxParcelas}
          valorMinimoBoleto={valorMinimoBoleto}
          valorDocumentoBoleto={valorDocumentoBoleto}
          intervaloBoleto={configPagamento.boleto.intervaloDias}
          precoCliente={dono ? Number(cliente.preco_metro) : 0}
          metragemImpressa={
            p.metragem_impressa != null ? Number(p.metragem_impressa) : null
          }
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
            produtoId: i.produto_id,
            sku: i.sku,
            nome: i.nome,
            pedida: i.quantidade_pedida,
            faturada: i.quantidade_faturada,
            precoMetro: dono ? Number(i.preco_unitario) : 0,
            imagemUrl: urls.get(i.produto_id) ?? null,
          }))}
        />
      )}

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold tracking-tight text-sm">
            Forma de pagamento
          </h2>
          <span className="text-xs font-mono text-[#6E6E68]">
            {ROTULOS_PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}
          </span>
        </div>

        {p.forma_pagamento === 'boleto_parcelado' && parcelas.length === 0 && (
          <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
            Cliente sugeriu {p.parcelas_solicitadas}x — parcelas ainda não
            geradas (defina ao confirmar o pedido).
          </p>
        )}

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
                {dono && !antesDoEstampando && (
                  <span className="font-mono">{brl(Number(pc.valor))}</span>
                )}
                <span className="text-[#6E6E68]">
                  venc. {dataBr(pc.vencimento)}
                </span>
                <ParcelaBadge vencimento={pc.vencimento} pagoEm={pc.pago_em} />
              </div>
            ))}
          </div>
        )}
      </div>

      {dono && (
        <NotaFiscal
          pedidoId={p.id}
          emitirNf={p.emitir_nf !== false}
          motivo={p.emitir_nf_motivo ?? null}
          editavel={!cancelado && !notaEmitida}
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
                {autorDe(h.criado_por) && (
                  <span className="ml-1.5">por {autorDe(h.criado_por)}</span>
                )}
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

      {alteracoes.length > 0 && (
        <>
          <Titulo>ALTERAÇÕES NO PEDIDO</Titulo>
          <div className="space-y-2">
            {alteracoes.map((a, i) => (
              <div
                key={i}
                className="bg-[#EEF4EF] border border-[#B9D8C2] rounded-sm p-3"
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#4A7A5A]">
                  {a.tipo}
                </span>
                <p className="text-sm leading-relaxed mt-1 text-[#2C4C38]">
                  {a.motivo}
                </p>
                <p className="text-[10px] font-mono text-[#6E9478] mt-1.5 uppercase tracking-wider">
                  {a.detalhe} · {dataHora(a.data)}
                  {a.autor && ` · por ${a.autor}`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
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