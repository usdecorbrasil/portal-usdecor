'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { emitirNotaFiscal, gerarCobranca } from '@/app/actions/faturamento'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dataBr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')

export type CobrancaLinha = {
  numero: number
  valor: number
  vencimento: string
  linkBoleto: string | null
  linkPix: string | null
  pdfUrl: string | null
}

/**
 * Faturamento do pedido, a partir de "Pedido pronto": nota fiscal e cobrança,
 * cada uma com seu botão. Só aparece quando o pedido já existe no Bling — sem
 * isso nenhum dos dois tem em cima do que agir.
 */
export default function Faturamento({
  pedidoId,
  blingNumero,
  emitirNf,
  nf,
  formaPagamento,
  cobranca,
}: {
  pedidoId: string
  blingNumero: string | null
  emitirNf: boolean
  nf: { numero: string; chave: string | null; emitidaEm: string; pdfUrl: string | null; xmlUrl: string | null; linkDanfe: string | null } | null
  formaPagamento: string
  cobranca: { geradaEm: string | null; linhas: CobrancaLinha[] }
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [acao, setAcao] = useState<'nf' | 'cobranca' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const ehCartao = formaPagamento.startsWith('cartao')
  const cobravel = formaPagamento.startsWith('boleto') || formaPagamento === 'pix'
  const cobrancaCompleta = ehCartao
    ? !!cobranca.geradaEm
    : cobranca.linhas.length > 0 && cobranca.linhas.every((l) => l.linkBoleto || l.linkPix)

  function rodar(qual: 'nf' | 'cobranca') {
    setMsg(null)
    setAcao(qual)
    iniciar(async () => {
      const r = qual === 'nf' ? await emitirNotaFiscal(pedidoId) : await gerarCobranca(pedidoId)
      setMsg(r.ok ? { ok: true, texto: r.detalhe } : { ok: false, texto: r.erro })
      setAcao(null)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold tracking-tight text-sm">Faturamento</h2>
        {blingNumero && (
          <span className="text-[11px] font-mono text-[#6E6E68]">Bling #{blingNumero}</span>
        )}
      </div>

      {/* ------------------------------ nota fiscal ------------------------------ */}
      <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-tight">Nota fiscal</p>
            {!emitirNf ? (
              <p className="text-[11px] text-[#6E6E68]">Pedido marcado para sair sem nota.</p>
            ) : nf ? (
              <p className="text-[11px] text-[#6E6E68]">
                nº <span className="font-mono text-[#131A2E]">{nf.numero}</span> · emitida em{' '}
                {new Date(nf.emitidaEm).toLocaleDateString('pt-BR')}
              </p>
            ) : (
              <p className="text-[11px] text-[#6E6E68]">Gera a NF-e no Bling, transmite à SEFAZ e envia DANFE e XML ao cliente.</p>
            )}
          </div>

          {emitirNf && !nf && (
            <button
              onClick={() => rodar('nf')}
              disabled={pendente}
              className="shrink-0 bg-[#131A2E] text-white rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente && acao === 'nf' ? 'EMITINDO...' : 'EMITIR NF'}
            </button>
          )}
        </div>

        {nf && (
          <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
            {nf.pdfUrl && <a href={nf.pdfUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">DANFE (PDF)</a>}
            {nf.xmlUrl && <a href={nf.xmlUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">XML</a>}
            {!nf.pdfUrl && nf.linkDanfe && <a href={nf.linkDanfe} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">DANFE no Bling</a>}
            {nf.chave && <span className="font-mono text-[#9B9A93] break-all">{nf.chave}</span>}
          </div>
        )}
      </div>

      {/* -------------------------------- cobrança -------------------------------- */}
      <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-tight">Cobrança</p>
            {ehCartao ? (
              <p className="text-[11px] text-[#6E6E68]">
                {cobrancaCompleta
                  ? 'Conta a receber no Bling e link de pagamento enviado ao cliente. A baixa é feita no Bling.'
                  : 'Lança a conta a receber no Bling, com a forma do cartão, para o financeiro dar baixa. O link de pagamento é enviado no bloco acima.'}
              </p>
            ) : !cobravel ? (
              <p className="text-[11px] text-[#6E6E68]">Esta forma de pagamento é cobrada fora do portal.</p>
            ) : cobrancaCompleta ? (
              <p className="text-[11px] text-[#6E6E68]">
                Gerada{cobranca.geradaEm ? ` em ${new Date(cobranca.geradaEm).toLocaleDateString('pt-BR')}` : ''} e enviada ao cliente.
              </p>
            ) : (
              <p className="text-[11px] text-[#6E6E68]">Lança as contas no Bling, que emite o boleto ou o Pix, e envia ao cliente.</p>
            )}
          </div>

          {(cobravel || ehCartao) && !cobrancaCompleta && (
            <button
              onClick={() => rodar('cobranca')}
              disabled={pendente}
              className="shrink-0 bg-[#131A2E] text-white rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente && acao === 'cobranca'
                ? ehCartao ? 'LANÇANDO...' : 'GERANDO...'
                : ehCartao ? 'LANÇAR CONTA' : cobranca.linhas.length ? 'COMPLETAR' : 'GERAR COBRANÇA'}
            </button>
          )}
        </div>

        {cobranca.linhas.length > 0 && (
          <div className="mt-2 space-y-1">
            {cobranca.linhas.map((l) => (
              <div key={l.numero} className="flex items-center justify-between gap-2 text-[11px] bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5">
                <span className="font-mono text-[#6E6E68]">{l.numero}/{cobranca.linhas.length}</span>
                <span className="font-mono">R$ {brl(l.valor)}</span>
                <span className="text-[#6E6E68]">venc. {dataBr(l.vencimento)}</span>
                <span className="flex gap-2 shrink-0">
                  {l.pdfUrl && <a href={l.pdfUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">PDF</a>}
                  {l.linkBoleto && <a href={l.linkBoleto} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">boleto</a>}
                  {l.linkPix && <a href={l.linkPix} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">pix</a>}
                  {!l.linkBoleto && !l.linkPix && <span className="text-[#9B9A93]">sem link</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <p
          className={
            'text-xs mt-3 rounded-sm px-2.5 py-2 border ' +
            (msg.ok ? 'text-[#2E7D4F] border-[#2E7D4F] bg-[#E3F0E8]' : 'text-[#B00063] border-[#B00063] bg-[#FFF6FA]')
          }
        >
          {msg.texto}
        </p>
      )}
    </div>
  )
}
