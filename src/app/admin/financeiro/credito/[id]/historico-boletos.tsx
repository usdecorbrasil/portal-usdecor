'use client'

import Link from 'next/link'
import type { BoletoHistorico } from '@/lib/credito/score'
import type { CobrancaPrevista } from '@/app/actions/credito'
import { ROTULOS } from '@/app/admin/pedidos/estagios'
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
  if (atraso > 0) return { rotulo: `vencido há ${atraso} d`, cor: 'bg-[#FBEAF0] text-[#B00063]', atraso }
  const faltam = -atraso
  return {
    rotulo: faltam === 0 ? 'vence hoje' : `vence em ${faltam} d`,
    cor: 'bg-[#E6EDEE] text-[#0090D8]',
    atraso: 0,
  }
}

const FORMA: Record<string, string> = {
  boleto_avista: 'boleto à vista',
  boleto_parcelado: 'boleto parcelado',
}

/**
 * Boletos do cliente em três blocos: em aberto (vencidos primeiro), a emitir
 * (pedidos em boleto que ainda não viraram boleto — contam no crédito em
 * uso) e pagos. Tudo o que o "em boletos hoje" soma aparece aqui.
 */
export default function HistoricoBoletos({
  cliente,
  boletos,
  previstos,
  hoje,
}: {
  cliente: string
  boletos: BoletoHistorico[]
  previstos: CobrancaPrevista[]
  hoje: string
}) {
  const abertos = boletos
    .filter((b) => !b.pagoEm)
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0))
  const pagos = boletos.filter((b) => !!b.pagoEm)
  const totalAberto = abertos.reduce((s, b) => s + b.valor, 0)
  const totalVencido = abertos.filter((b) => b.vencimento < hoje).reduce((s, b) => s + b.valor, 0)
  const totalPrevisto = previstos.reduce((s, p) => s + p.valor, 0)

  function exportar() {
    baixarCsv(
      `boletos-${cliente.replace(/[^\w]+/g, '-').toLowerCase()}.csv`,
      paraCsv([
        ['Pedido', 'Parcela', 'Valor', 'Vencimento', 'Pago em', 'Situação', 'Dias de atraso'],
        ...[...abertos, ...pagos].map((b) => {
          const s = situacao(b, hoje)
          return [b.pedidoNumero, b.parcela, numCsv(b.valor), dataBr(b.vencimento), b.pagoEm ? dataBr(b.pagoEm) : '', s.rotulo, s.atraso]
        }),
        ...previstos.map((p) => [
          p.pedidoNumero,
          p.parcelas && p.parcelas > 1 ? `${p.parcelas}x (a emitir)` : 'a emitir',
          numCsv(p.valor),
          p.vencimentoPrevisto ? dataBr(p.vencimentoPrevisto) : '',
          '',
          `a emitir · ${ROTULOS[p.etapa] ?? p.etapa}`,
          0,
        ]),
      ])
    )
  }

  const temAlgo = boletos.length > 0 || previstos.length > 0

  return (
    <section className="mt-6">
      <h3 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
        BOLETOS
        <span className="flex-1 h-px bg-[#DDDCD5]" />
        <span className="font-mono normal-case tracking-normal text-[#9B9A93]">{boletos.length + previstos.length}</span>
        {temAlgo && (
          <button type="button" onClick={exportar} className="normal-case tracking-normal text-[#0090D8] hover:underline">
            exportar CSV
          </button>
        )}
      </h3>

      {!temAlgo && <div className={VAZIO}>Nenhum boleto emitido nem pedido em boleto para este cliente.</div>}

      {abertos.length > 0 && (
        <Bloco
          titulo="Em aberto"
          resumo={
            <>
              R$ {brl(totalAberto)}
              {totalVencido > 0 && <span className="text-[#B00063]"> · R$ {brl(totalVencido)} vencido</span>}
            </>
          }
        >
          <Linhas boletos={abertos} hoje={hoje} />
        </Bloco>
      )}

      {previstos.length > 0 && (
        <Bloco
          titulo="A emitir"
          resumo={<>R$ {brl(totalPrevisto)} · pedidos em boleto ainda sem boleto gerado; contam no crédito em uso</>}
        >
          <div className={CAIXA}>
            <div className={CABECALHO}>
              <span className="w-14 shrink-0">Pedido</span>
              <span className="flex-1 min-w-0">Etapa</span>
              <span className="w-24 shrink-0 text-right">Valor</span>
              <span className="w-24 shrink-0 text-right hidden sm:inline">Forma</span>
              <span className="w-20 shrink-0 text-right">Venc.</span>
            </div>
            <div className={CORPO}>
              {previstos.map((p) => (
                <div key={p.pedidoId} className="flex items-center gap-2 px-2.5 py-1.5 bg-white">
                  <Link href={`/admin/pedidos/${p.pedidoId}`} className={NUM + ' w-14 shrink-0 text-[#0090D8] hover:underline'}>
                    #{p.pedidoNumero}
                  </Link>
                  <span className="flex-1 min-w-0 truncate">
                    <span className={ETIQUETA + ' bg-[#EEEDE7] text-[#6E6E68]'}>{ROTULOS[p.etapa] ?? p.etapa}</span>
                  </span>
                  <span className={NUM + ' w-24 shrink-0 text-right'}>
                    {p.valor > 0 ? `R$ ${brl(p.valor)}` : <span className="text-[#9B9A93]">sem metragem</span>}
                  </span>
                  <span className="w-24 shrink-0 text-right hidden sm:inline text-xs text-[#6E6E68]">
                    {FORMA[p.forma] ?? p.forma}
                    {p.parcelas && p.parcelas > 1 ? ` ${p.parcelas}x` : ''}
                  </span>
                  <span className={NUM + ' w-20 shrink-0 text-right text-[#6E6E68]'}>
                    {p.vencimentoPrevisto ? dataBr(p.vencimentoPrevisto) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Bloco>
      )}

      {pagos.length > 0 && (
        <Bloco titulo="Pagos" resumo={<>{pagos.length} boleto{pagos.length > 1 ? 's' : ''}</>}>
          <Linhas boletos={pagos} hoje={hoje} />
        </Bloco>
      )}
    </section>
  )
}

function Bloco({ titulo, resumo, children }: { titulo: string; resumo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs mb-1.5 flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-[#131A2E]">{titulo}</span>
        <span className="font-mono text-[#6E6E68]">{resumo}</span>
      </p>
      {children}
    </div>
  )
}

function Linhas({ boletos, hoje }: { boletos: BoletoHistorico[]; hoje: string }) {
  return (
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
  )
}
