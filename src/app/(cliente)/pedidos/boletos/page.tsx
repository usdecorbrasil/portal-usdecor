import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { urlDocumento } from '@/lib/storage/documentos'
import { valorCobranca } from '@/lib/pagamento/config'
import { CAIXA, CORPO, ETIQUETA, NUM, TITULO_GRUPO, VAZIO } from '@/components/estilo-lista'
import AbasPedidos from '../abas-pedidos'
import LinhaDigitavel from './linha-digitavel'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function dataBr(iso: string) {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('pt-BR')
}

/**
 * Uma cobrança do cliente: parcela de boleto, ou a cobrança única de um
 * pedido à vista. Preparado para Pix e cartão: `forma` e os links dizem o
 * que dá para fazer; boleto é o que tem linha digitável e PDF.
 */
type Cobranca = {
  chave: string
  pedidoId: string
  pedidoNumero: number
  parcela: string | null
  forma: string
  valor: number
  vencimento: string | null
  pagoEm: string | null
  vencida: boolean
  linhaDigitavel: string | null
  linkBoleto: string | null
  linkPix: string | null
  linkCartao: string | null
  pdfUrl: string | null
}

const ROTULO_FORMA: Record<string, string> = {
  boleto_avista: 'Boleto',
  boleto_parcelado: 'Boleto',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

export default async function BoletosClientePage() {
  const supabase = await createClient()
  const hoje = new Date(new Date().toDateString())

  // As políticas do banco restringem aos pedidos deste cliente. Pedido
  // cancelado não cobra nada; antes da cobrança gerada não há o que mostrar
  const [{ data: parcelas }, { data: avista }] = await Promise.all([
    supabase
      .from('pedido_parcelas')
      .select(
        'id, numero, valor, vencimento, pago_em, boleto_linha, link_boleto, link_pix, boleto_pdf_path, ' +
          'pedidos!inner(id, numero, cancelado_em, forma_pagamento, cobranca_gerada_em)'
      )
      .is('pedidos.cancelado_em', null)
      .not('pedidos.cobranca_gerada_em', 'is', null)
      .order('vencimento'),
    supabase
      .from('pedidos')
      .select(
        'id, numero, total, forma_pagamento, taxa_pagamento_percentual, taxa_pagamento_fixa, ' +
          'pago_em, link_boleto, link_pix, link_pagamento, boleto_pdf_path, cobranca_gerada_em, pedido_parcelas(id)'
      )
      .is('cancelado_em', null)
      .not('cobranca_gerada_em', 'is', null),
  ])

  const porPedido = new Map<string, number>()
  for (const p of (parcelas ?? []) as any[]) {
    const id = p.pedidos?.id as string
    porPedido.set(id, (porPedido.get(id) ?? 0) + 1)
  }

  const cobrancas: Cobranca[] = []

  for (const p of (parcelas ?? []) as any[]) {
    const pedido = p.pedidos
    const pagoEm = (p.pago_em as string | null) ?? null
    cobrancas.push({
      chave: 'parcela-' + p.id,
      pedidoId: pedido.id,
      pedidoNumero: Number(pedido.numero),
      parcela: `${p.numero}/${porPedido.get(pedido.id) ?? 1}`,
      forma: pedido.forma_pagamento,
      valor: Number(p.valor),
      vencimento: p.vencimento,
      pagoEm,
      vencida: !pagoEm && new Date(p.vencimento + 'T00:00:00') < hoje,
      linhaDigitavel: (p.boleto_linha as string | null) ?? null,
      linkBoleto: (p.link_boleto as string | null) ?? null,
      linkPix: (p.link_pix as string | null) ?? null,
      linkCartao: null,
      // Segunda via é o mesmo PDF: o banco aplica juros e multa na leitura
      pdfUrl: pagoEm ? null : await urlDocumento(p.boleto_pdf_path),
    })
  }

  for (const p of (avista ?? []) as any[]) {
    if ((p.pedido_parcelas ?? []).length > 0) continue
    const pagoEm = (p.pago_em as string | null) ?? null
    const ehCartao = String(p.forma_pagamento ?? '').startsWith('cartao')
    cobrancas.push({
      chave: 'pedido-' + p.id,
      pedidoId: p.id,
      pedidoNumero: Number(p.numero),
      parcela: null,
      forma: p.forma_pagamento,
      valor: valorCobranca(
        Number(p.total),
        Number(p.taxa_pagamento_percentual ?? 0),
        Number(p.taxa_pagamento_fixa ?? 0),
        p.forma_pagamento,
        1
      ),
      // À vista o portal não guarda o vencimento: o boleto do Bling é que diz
      vencimento: null,
      pagoEm,
      vencida: false,
      linhaDigitavel: null,
      linkBoleto: (p.link_boleto as string | null) ?? null,
      linkPix: (p.link_pix as string | null) ?? null,
      linkCartao: ehCartao ? ((p.link_pagamento as string | null) ?? null) : null,
      pdfUrl: pagoEm ? null : await urlDocumento(p.boleto_pdf_path),
    })
  }

  const vencidas = cobrancas.filter((c) => !c.pagoEm && c.vencida)
  const abertas = cobrancas.filter((c) => !c.pagoEm && !c.vencida)
  const pagas = cobrancas
    .filter((c) => c.pagoEm)
    .sort((a, b) => new Date(b.pagoEm!).getTime() - new Date(a.pagoEm!).getTime())

  const totalVencido = vencidas.reduce((a, c) => a + c.valor, 0)
  const totalAberto = abertas.reduce((a, c) => a + c.valor, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">Meus pedidos</h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-4">
        Boletos e cobranças dos seus pedidos
      </p>

      <AbasPedidos />

      {cobrancas.length === 0 ? (
        <div className={VAZIO}>
          <p>Nenhuma cobrança por enquanto.</p>
          <p className="text-xs mt-1">
            Os boletos aparecem aqui quando um pedido fica pronto e é faturado.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <Grupo
            titulo="Vencidos"
            itens={vencidas}
            total={totalVencido}
            destaque
            vazio="Nenhum boleto vencido."
          />
          <Grupo titulo="Em aberto" itens={abertas} total={totalAberto} vazio="Nada em aberto." />
          <Grupo titulo="Pagos" itens={pagas} vazio="Nenhum pagamento registrado ainda." />
        </div>
      )}
    </div>
  )
}

function Grupo({
  titulo,
  itens,
  total,
  destaque = false,
  vazio,
}: {
  titulo: string
  itens: Cobranca[]
  total?: number
  destaque?: boolean
  vazio: string
}) {
  return (
    <section>
      <div className={TITULO_GRUPO + (destaque && itens.length ? ' text-[#B00063] border-[#E8A9C7]' : '')}>
        <span>{titulo}</span>
        <span className="font-mono normal-case tracking-normal text-[#9B9A93]">{itens.length}</span>
        {total !== undefined && itens.length > 0 && (
          <span className="ml-auto font-mono normal-case tracking-normal">R$ {brl(total)}</span>
        )}
      </div>

      <div className={CAIXA + ' rounded-t-none' + (destaque && itens.length ? ' border-[#E8A9C7]' : '')}>
        {itens.length === 0 ? (
          <p className="px-3 py-3 text-xs text-[#9B9A93]">{vazio}</p>
        ) : (
          <div className={CORPO}>
            {itens.map((c) => (
              <LinhaCobranca key={c.chave} c={c} destaque={destaque} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function LinhaCobranca({ c, destaque }: { c: Cobranca; destaque: boolean }) {
  const forma = ROTULO_FORMA[c.forma] ?? c.forma
  const ehBoleto = c.forma.startsWith('boleto')

  return (
    <div className={'flex items-stretch ' + (destaque ? 'bg-[#FFF6FA]' : 'bg-white')}>
      <span
        aria-hidden
        className={'w-1 shrink-0 ' + (c.pagoEm ? 'bg-[#8CB399]' : destaque ? 'bg-[#B00063]' : 'bg-[#C4A868]')}
      />
      <div className="flex-1 min-w-0 px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/pedidos/${c.pedidoId}`}
            className="font-semibold tracking-tight text-sm hover:underline"
          >
            Pedido {c.pedidoNumero}
          </Link>
          {c.parcela && <span className={NUM + ' text-[#6E6E68]'}>parcela {c.parcela}</span>}
          <span className={ETIQUETA + ' bg-[#EAE9E3] text-[#6E6E68]'}>{forma}</span>
          <span className={NUM + ' ml-auto font-bold text-sm text-[#131A2E]'}>R$ {brl(c.valor)}</span>
        </div>

        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-xs">
          {c.pagoEm ? (
            <span className="text-[#2E7D4F]">pago em {dataBr(c.pagoEm)}</span>
          ) : c.vencimento ? (
            <span className={destaque ? 'text-[#B00063] font-semibold' : 'text-[#6E6E68]'}>
              {destaque ? 'venceu em' : 'vence em'} {dataBr(c.vencimento)}
            </span>
          ) : (
            <span className="text-[#6E6E68]">à vista</span>
          )}

          {!c.pagoEm && (
            <span className="flex items-center gap-2 ml-auto">
              {c.pdfUrl && (
                <a href={c.pdfUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline font-semibold">
                  PDF
                </a>
              )}
              {!c.pdfUrl && c.linkBoleto && (
                <a href={c.linkBoleto} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline font-semibold">
                  boleto
                </a>
              )}
              {c.linkPix && (
                <a href={c.linkPix} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline font-semibold">
                  Pix
                </a>
              )}
              {c.linkCartao && (
                <a href={c.linkCartao} target="_blank" rel="noreferrer" className="text-[#D8007A] hover:underline font-semibold">
                  pagar com cartão
                </a>
              )}
              {ehBoleto && !c.pdfUrl && !c.linkBoleto && !c.linhaDigitavel && (
                <span className="text-[#9B9A93]">boleto a caminho</span>
              )}
            </span>
          )}
        </div>

        {!c.pagoEm && c.linhaDigitavel && (
          <div className="mt-1.5">
            <LinhaDigitavel linha={c.linhaDigitavel} />
          </div>
        )}
      </div>
    </div>
  )
}
