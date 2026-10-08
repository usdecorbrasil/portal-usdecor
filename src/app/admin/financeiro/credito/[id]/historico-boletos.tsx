'use client'

import Link from 'next/link'
import type { BoletoHistorico } from '@/lib/credito/score'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, VAZIO } from '@/components/estilo-lista'
import { baixarCsv, numCsv, paraCsv } from '@/components/baixar-csv'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
const DIA = 86_400_000
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / DIA)

type Situacao = { rotulo: string; cor: string; atraso: number }

function situacao(b: BoletoHistorico, hoje: string): Situacao {
  if (b.pagoEm) {
    const atraso = diasEntre(b.vencimento, b.pagoEm)
    return atraso <= 0
      ? { rotulo: 'pago em dia', cor: 'bg-[#E3F0E8] text-[#2E7D4F]', atraso: 0 }
      : { rotulo: `pago com ${atraso} d de atraso`, cor: 'bg-[#FBF0D9] text-[#8A6A00]', atraso }
  }
  const atraso = diasEntre(b.vencimento, hoje)
  return atraso > 0
    ? { rotulo: `vencido há ${atraso} d`, cor: 'bg-[#FBEAF0] text-[#B00063]', atraso }
    : { rotulo: 'a vencer', cor: 'bg-[#E6EDEE] text-[#0090D8]', atraso: 0 }
}

export default function HistoricoBoletos({
  cliente,
  boletos,
  hoje,
}: {
  cliente: string
  boletos: BoletoHistorico[]
  hoje: string
}) {
  function exportar() {
    baixarCsv(
      `boletos-${cliente.replace(/[^\w]+/g, '-').toLowerCase()}.csv`,
      paraCsv([
        ['Pedido', 'Parcela', 'Valor', 'Vencimento', 'Pago em', 'Situação', 'Dias de atraso'],
        ...boletos.map((b) => {
          const s = situacao(b, hoje)
          return [b.pedidoNumero, b.parcela, numCsv(b.valor), dataBr(b.vencimento), b.pagoEm ? dataBr(b.pagoEm) : '', s.rotulo, s.atraso]
        }),
      ])
    )
  }

  return (
    <section className="mt-6">
      <h3 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
        HISTÓRICO DE BOLETOS
        <span className="flex-1 h-px bg-[#DDDCD5]" />
        <span className="font-mono normal-case tracking-normal text-[#9B9A93]">{boletos.length}</span>
        {boletos.length > 0 && (
          <button type="button" onClick={exportar} className="normal-case tracking-normal text-[#0090D8] hover:underline">
            exportar CSV
          </button>
        )}
      </h3>

      {boletos.length === 0 ? (
        <div className={VAZIO}>Nenhum boleto emitido para este cliente.</div>
      ) : (
        <div className={CAIXA}>
          <div className={CABECALHO}>
            <span className="w-14 shrink-0">Pedido</span>
            <span className="w-14 shrink-0">Parc.</span>
            <span className="w-24 shrink-0 text-right">Valor</span>
            <span className="w-20 shrink-0 text-right">Venc.</span>
            <span className="w-20 shrink-0 text-right hidden sm:inline">Pago em</span>
            <span className="flex-1 min-w-0 text-right">Situação</span>
          </div>
          <div className={CORPO}>
            {boletos.map((b, i) => {
              const s = situacao(b, hoje)
              return (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-white">
                  <Link href={`/admin/pedidos/${b.pedidoId}`} className={NUM + ' w-14 shrink-0 text-[#0090D8] hover:underline'}>
                    #{b.pedidoNumero}
                  </Link>
                  <span className={NUM + ' w-14 shrink-0 text-[#6E6E68]'}>{b.parcela}</span>
                  <span className={NUM + ' w-24 shrink-0 text-right'}>R$ {brl(b.valor)}</span>
                  <span className={NUM + ' w-20 shrink-0 text-right'}>{dataBr(b.vencimento)}</span>
                  <span className={NUM + ' w-20 shrink-0 text-right hidden sm:inline text-[#6E6E68]'}>{b.pagoEm ? dataBr(b.pagoEm) : '—'}</span>
                  <span className="flex-1 min-w-0 text-right">
                    <span className={ETIQUETA + ' ' + s.cor}>{s.rotulo}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
