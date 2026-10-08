import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fichaCredito } from '@/app/actions/credito'
import { COR_CLASSE, ROTULO_ACAO, ROTULO_CLASSE } from '@/lib/credito/score'
import { ETIQUETA, NUM } from '@/components/estilo-lista'
import HistoricoBoletos from './historico-boletos'
import AjustarLimite from './ajustar-limite'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

const MESES_OPCOES = [6, 12, 24]

/** Ficha de crédito de um cliente: score aberto por parte, boletos, limite e sugestão. */
export default async function FichaCreditoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ meses?: string }>
}) {
  const [{ id }, { meses: mesesParam }] = await Promise.all([params, searchParams])
  const meses = MESES_OPCOES.includes(Number(mesesParam)) ? Number(mesesParam) : 12
  const f = await fichaCredito(id, meses)
  if (!f) notFound()

  const s = f.score
  const uso = f.limite > 0 ? f.emUso / f.limite : 0
  // O "em boletos hoje" vem de credito_em_uso; aqui se abre a conta para a
  // tela não parecer contradizer a lista de boletos logo abaixo
  const emitidoAberto = f.boletos.filter((b) => !b.pagoEm).reduce((s, b) => s + b.valor, 0)
  const previstoTotal = f.previstos.reduce((s, p) => s + p.valor, 0)
  const sug = s.sugestao

  return (
    <div>
      <Link href={`/admin/financeiro/credito?meses=${meses}`} className="text-xs text-[#0090D8] hover:underline">
        ← todos os clientes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#131A2E]">{f.cliente}</h2>
          <p className="text-xs text-[#6E6E68] mt-0.5">
            {f.clienteDesde ? `cliente desde ${dataBr(f.clienteDesde)}` : ''}
            {!f.ativo && ' · inativo'}
            {' · '}
            <Link href={`/admin/clientes/${f.clienteId}`} className="text-[#0090D8] hover:underline">
              cadastro
            </Link>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold text-[#131A2E] leading-none">{s.score}</p>
          <span className={ETIQUETA + ' mt-1 inline-block ' + COR_CLASSE[s.classe]}>{ROTULO_CLASSE[s.classe]}</span>
        </div>
      </div>

      {/* ------------------------------ score aberto ------------------------------ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <Parte rotulo="Pontualidade" valor={s.pontualidade} max={50} alerta={s.pontualidade < 0}
          detalhe={s.boletosAvaliados === 0 ? 'sem boleto vencido ainda' : `${s.pagosEmDia} em dia · ${s.pagosComAtraso} com atraso${s.atrasoMedio ? ` (média ${s.atrasoMedio} d)` : ''}`} />
        <Parte rotulo="Volume" valor={s.volume} max={30} detalhe={`R$ ${brl(f.faturamento)} em ${meses} meses`} />
        <Parte rotulo="Frequência" valor={s.frequencia} max={20} detalhe={`${f.pedidos} pedido${f.pedidos === 1 ? '' : 's'} em ${meses} meses`} />
        <Parte rotulo="Penalidade" valor={-s.penalidade} max={0} alerta={s.penalidade > 0}
          detalhe={s.vencidosAbertos > 0 ? `${s.vencidosAbertos} vencido${s.vencidosAbertos > 1 ? 's' : ''} em aberto · maior atraso ${s.maiorAtrasoAberto} d` : 'nenhum boleto vencido em aberto'} />
      </div>

      {/* --------------------------------- limite --------------------------------- */}
      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">Limite de crédito</p>
            <p className="font-mono text-lg font-semibold">{f.limite > 0 ? `R$ ${brl(f.limite)}` : 'sem limite'}</p>
            <p className="text-xs text-[#6E6E68]">
              <span className="font-mono">R$ {brl(f.emUso)}</span> em boletos hoje
              {f.limite > 0 && ` · ${Math.round(uso * 100)}% do limite`}
            </p>
            <p className="text-[11px] text-[#9B9A93]">
              <span className="font-mono">R$ {brl(emitidoAberto)}</span> em boletos emitidos
              {f.previstos.length > 0 && (
                <>
                  {' · '}
                  <span className="font-mono">R$ {brl(previstoTotal)}</span> em {f.previstos.length} pedido
                  {f.previstos.length > 1 ? 's' : ''} em boleto ainda sem boleto gerado
                </>
              )}
            </p>
            {f.limite > 0 && (
              <div className="h-1.5 w-56 max-w-full bg-[#EEEDE7] rounded-full mt-1.5 overflow-hidden">
                <div className={'h-full ' + (uso >= 1 ? 'bg-[#B00063]' : uso >= 0.8 ? 'bg-[#C79600]' : 'bg-[#131A2E]')} style={{ width: `${Math.min(100, Math.round(uso * 100))}%` }} />
              </div>
            )}
          </div>
          <div className={'text-right ' + (sug.acao === 'reduzir' ? 'text-[#B00063]' : sug.acao === 'manter' ? 'text-[#6E6E68]' : 'text-[#2E7D4F]')}>
            <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">Sugestão</p>
            <p className="text-sm font-semibold">
              {ROTULO_ACAO[sug.acao]}
              {sug.acao !== 'manter' && <span className={NUM + ' ml-1.5 text-sm'}>R$ {brl(sug.limiteSugerido)}</span>}
            </p>
            <p className="text-[11px] max-w-xs">{sug.motivo}</p>
          </div>
        </div>

        {f.atrasoLiberadoEm && (
          <p className="text-[11px] text-[#8A6A00] mt-3">
            Trava por atraso liberada em {dataBr(f.atrasoLiberadoEm)}: {f.atrasoLiberadoMotivo}
          </p>
        )}

        <AjustarLimite
          clienteId={f.clienteId}
          cliente={f.cliente}
          limiteAtual={f.limite}
          emUso={f.emUso}
          sugestao={sug}
        />

        {f.mudancasLimite.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#DDDCD5]">
            <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] mb-1.5">Mudanças de limite</p>
            <ul className="space-y-1">
              {f.mudancasLimite.map((m, i) => (
                <li key={i} className="text-xs flex flex-wrap gap-x-2">
                  <span className="font-mono text-[#9B9A93]">{dataBr(m.data)}</span>
                  <span className="font-mono">
                    {m.de != null ? `R$ ${brl(m.de)}` : '—'} → {m.para != null ? `R$ ${brl(m.para)}` : '—'}
                  </span>
                  {m.autor && <span className="text-[#9B9A93]">por {m.autor}</span>}
                  {m.motivo && <span className="text-[#6E6E68] basis-full">{m.motivo}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <HistoricoBoletos cliente={f.cliente} boletos={f.boletos} previstos={f.previstos} hoje={new Date().toISOString().slice(0, 10)} />
    </div>
  )
}

function Parte({ rotulo, valor, max, detalhe, alerta }: { rotulo: string; valor: number; max: number; detalhe: string; alerta?: boolean }) {
  return (
    <div className={'border rounded-sm px-3 py-2.5 bg-white ' + (alerta ? 'border-[#E8A9C7]' : 'border-[#E4E3DC]')}>
      <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">{rotulo}</p>
      <p className={'font-mono text-lg font-semibold mt-0.5 ' + (alerta ? 'text-[#B00063]' : 'text-[#131A2E]')}>
        {valor}
        {max > 0 && <span className="text-xs text-[#9B9A93] font-normal"> / {max}</span>}
      </p>
      <p className="text-[11px] text-[#6E6E68] leading-snug">{detalhe}</p>
    </div>
  )
}
