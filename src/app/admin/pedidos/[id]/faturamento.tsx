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
 * Documentos do faturamento: nota fiscal e cobrança, só leitura. Quem emite e
 * cobra é o botão Faturar (`faturarPedido`), que faz tudo de uma vez; se algo
 * ficou pela metade, o bloco "Pedido faturado" oferece concluir. Aqui ficam
 * os links que o financeiro consulta depois.
 */
export default function Faturamento({
  blingNumero,
  emitirNf,
  nf,
  formaPagamento,
  cobranca,
}: {
  blingNumero: string | null
  emitirNf: boolean
  nf: { numero: string; chave: string | null; emitidaEm: string; pdfUrl: string | null; xmlUrl: string | null; linkDanfe: string | null } | null
  formaPagamento: string
  cobranca: { geradaEm: string | null; linhas: CobrancaLinha[] }
}) {
  const ehCartao = formaPagamento.startsWith('cartao')
  const cobravel = formaPagamento.startsWith('boleto') || formaPagamento === 'pix'

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold tracking-tight text-sm">Documentos do faturamento</h2>
        {blingNumero && (
          <span className="text-[11px] font-mono text-[#6E6E68]">Bling #{blingNumero}</span>
        )}
      </div>

      {/* ------------------------------ nota fiscal ------------------------------ */}
      <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
        <p className="text-xs font-semibold tracking-tight">Nota fiscal</p>
        {!emitirNf ? (
          <p className="text-[11px] text-[#6E6E68]">Pedido marcado para sair sem nota.</p>
        ) : nf ? (
          <>
            <p className="text-[11px] text-[#6E6E68]">
              nº <span className="font-mono text-[#131A2E]">{nf.numero}</span> · emitida em{' '}
              {new Date(nf.emitidaEm).toLocaleDateString('pt-BR')}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
              {nf.pdfUrl && <a href={nf.pdfUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">DANFE (PDF)</a>}
              {nf.xmlUrl && <a href={nf.xmlUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">XML</a>}
              {!nf.pdfUrl && nf.linkDanfe && <a href={nf.linkDanfe} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">DANFE no Bling</a>}
              {nf.chave && <span className="font-mono text-[#9B9A93] break-all">{nf.chave}</span>}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-[#8A6A00]">
            Ainda não emitida. O Faturar emite a nota; se ficou pendente, use &ldquo;Concluir faturamento&rdquo; no bloco acima.
          </p>
        )}
      </div>

      {/* -------------------------------- cobrança -------------------------------- */}
      <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
        <p className="text-xs font-semibold tracking-tight">Cobrança</p>
        {ehCartao ? (
          <p className="text-[11px] text-[#6E6E68]">
            {cobranca.geradaEm
              ? 'Conta a receber no Bling; o link de pagamento é enviado no bloco acima. A baixa é feita no Bling.'
              : 'Conta a receber ainda não lançada no Bling.'}
          </p>
        ) : !cobravel ? (
          <p className="text-[11px] text-[#6E6E68]">Esta forma de pagamento é cobrada fora do portal.</p>
        ) : cobranca.geradaEm ? (
          <p className="text-[11px] text-[#6E6E68]">
            Gerada em {new Date(cobranca.geradaEm).toLocaleDateString('pt-BR')} e enviada ao cliente.
          </p>
        ) : (
          <p className="text-[11px] text-[#8A6A00]">Ainda não gerada.</p>
        )}

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
    </div>
  )
}
