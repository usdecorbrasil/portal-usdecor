import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { gerarRelatorio, relatorioEstampa } from '@/app/actions/relatorios'
import FiltrosRelatorio from './filtros'
import Exportar from './exportar'
import SeletorTipo, { type TipoRelatorio } from './seletor-tipo'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function inicioDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string
    ate?: string
    status?: string
    cliente?: string
    tipo?: string
  }>
}) {
  const { de, ate, status, cliente, tipo } = await searchParams
  const dataDe = de ?? inicioDoMes()
  const dataAte = ate ?? hoje()
  const aba = (tipo ?? 'pedidos') as TipoRelatorio

  const supabase = await createClient()

  const [relatorio, { data: clientes }, estampa] = await Promise.all([
    gerarRelatorio({ de: dataDe, ate: dataAte, status, clienteId: cliente }),
    supabase
      .from('clientes')
      .select('id, razao_social')
      .order('razao_social'),
    // Só a divisão de estampa usa; nas outras não vale a consulta
    aba === 'estampa' ? relatorioEstampa({ de: dataDe, ate: dataAte, clienteId: cliente }) : Promise.resolve(null),
  ])

  const r = relatorio.resumo
  const periodo = `${dataDe}_a_${dataAte}`

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-4 leading-relaxed">
        {aba === 'estampa'
          ? 'Metros que passaram pela estamparia no período: pedidos cuja etapa Estampando foi lançada entre as datas, com a metragem impressa final. Para conferir a fatura do prestador.'
          : 'Pedidos criados no período. Cancelados não entram no faturamento.'}
      </p>

      <FiltrosRelatorio
        clientes={clientes ?? []}
        de={dataDe}
        ate={dataAte}
        status={status}
        clienteId={cliente}
        tipo={aba}
      />

      <div className="mt-5">
        <SeletorTipo
          atual={aba}
          parametros={{ de: dataDe, ate: dataAte, status, cliente }}
        />
      </div>

      <div className="mt-4">
        <Exportar relatorio={relatorio} periodo={periodo} tipo={aba} estampa={estampa} />
      </div>

      {aba === 'estampa' && estampa && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <Cartao rotulo="METROS ESTAMPADOS" valor={`${brl(estampa.resumo.metros)} m`} />
            <Cartao rotulo="PEDIDOS" valor={String(estampa.resumo.pedidos)} />
            <Cartao rotulo="CLIENTES" valor={String(estampa.porCliente.length)} />
            <Cartao
              rotulo="SEM METRAGEM"
              valor={String(estampa.resumo.semMetragem)}
              alerta={estampa.resumo.semMetragem > 0}
            />
          </div>
          {estampa.resumo.semMetragem > 0 && (
            <p className="text-xs text-[#8A6A00] bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm px-3 py-2 mt-3 leading-relaxed">
              {estampa.resumo.semMetragem} pedido{estampa.resumo.semMetragem > 1 ? 's' : ''} em Estampando sem
              metragem registrada: o romaneio não foi confirmado. Entram na lista com 0 m.
            </p>
          )}

          {estampa.linhas.length === 0 ? (
            <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-6">
              <p className="text-sm text-[#6E6E68]">Nenhum pedido entrou em Estampando neste período.</p>
            </div>
          ) : (
            <>
              <Titulo>POR TECIDO</Titulo>
              <div className="space-y-1.5">
                {estampa.porTecido.map((t) => (
                  <div key={t.tecido} className="flex items-center justify-between gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5">
                    <span className="text-sm truncate flex-1 min-w-0">{t.tecido}</span>
                    <span className="flex items-baseline gap-3 shrink-0 font-mono text-xs text-[#6E6E68]">
                      <span>{t.pedidos} ped.</span>
                      <span className="text-sm font-bold text-[#131A2E]">{brl(t.metros)} m</span>
                    </span>
                  </div>
                ))}
              </div>

              <Titulo>POR CLIENTE</Titulo>
              <div className="space-y-1.5">
                {estampa.porCliente.map((c) => (
                  <div key={c.clienteId} className="flex items-center justify-between gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5">
                    <span className="text-sm truncate flex-1 min-w-0">{c.cliente}</span>
                    <span className="flex items-baseline gap-3 shrink-0 font-mono text-xs text-[#6E6E68]">
                      <span>{c.pedidos} ped.</span>
                      <span className="text-sm font-bold text-[#131A2E]">{brl(c.metros)} m</span>
                    </span>
                  </div>
                ))}
              </div>

              <Titulo>POR DIA — PEDIDO A PEDIDO ({estampa.linhas.length})</Titulo>
              <div className="space-y-3">
                {estampa.porDia.map((d) => (
                  <div key={d.dia}>
                    <div className="flex items-baseline justify-between gap-3 px-1 mb-1">
                      <span className="text-xs font-semibold text-[#131A2E]">
                        {new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      </span>
                      <span className="font-mono text-xs text-[#6E6E68]">
                        {d.pedidos} ped. · <span className="font-bold text-[#131A2E]">{brl(d.metros)} m</span>
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {estampa.linhas
                        .filter((l) => l.estampadoEm === d.dia)
                        .map((l) => (
                          <Link
                            key={l.pedidoId}
                            href={`/admin/pedidos/${l.pedidoId}`}
                            className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5 hover:border-[#131A2E]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-mono text-xs text-[#6E6E68] shrink-0">{l.numero} ·</span>
                                <span className="text-sm font-semibold truncate">{l.cliente}</span>
                              </div>
                              <span className={`text-xs ${l.cancelado ? 'text-[#B00063]' : 'text-[#6E6E68]'}`}>
                                {l.tecido ?? 'tecido não informado'}
                                {l.prontoEm && ` · pronta em ${new Date(l.prontoEm + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                                {l.lancamentos > 1 && ` · ${l.lancamentos} lançamentos`}
                                {l.cancelado && ' · cancelado'}
                              </span>
                            </div>
                            <div className="text-right shrink-0 font-mono">
                              <div className={`font-bold text-sm ${l.metros === 0 ? 'text-[#B00063]' : 'text-[#131A2E]'}`}>
                                {brl(l.metros)} m
                              </div>
                            </div>
                            <span className="text-[#DDDCD5] shrink-0">›</span>
                          </Link>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {aba === 'financeiro' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <Cartao
              rotulo="FATURAMENTO"
              valor={`R$ ${brl(r.faturamento)}`}
            />
            <Cartao
              rotulo="RECEBIDO"
              valor={`R$ ${brl(relatorio.resumoParcelas.recebido)}`}
            />
            <Cartao
              rotulo="A RECEBER"
              valor={`R$ ${brl(relatorio.resumoParcelas.aReceber)}`}
            />
            <Cartao
              rotulo="VENCIDO"
              valor={`R$ ${brl(relatorio.resumoParcelas.vencido)}`}
              alerta={relatorio.resumoParcelas.vencido > 0}
            />
          </div>

          <Titulo>
            PARCELAS COM VENCIMENTO NO PERÍODO ({relatorio.parcelas.length})
          </Titulo>

          {relatorio.parcelas.length === 0 ? (
            <p className="text-sm text-[#6E6E68] border border-dashed border-[#DDDCD5] rounded-sm py-12 text-center">
              Nenhuma parcela vence neste período.
            </p>
          ) : (
            <div className="space-y-1.5">
              {relatorio.parcelas.map((p, i) => (
                <Link
                  key={i}
                  href={`/admin/pedidos/${p.pedidoId}`}
                  className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5 hover:border-[#131A2E]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-xs text-[#6E6E68] shrink-0">
                        {p.numero} ·
                      </span>
                      <span className="text-sm font-semibold truncate">
                        {p.cliente}
                      </span>
                    </div>
                    <span className="text-xs text-[#6E6E68]">
                      parcela {p.parcela} · venc.{' '}
                      {new Date(p.vencimento + 'T00:00:00').toLocaleDateString(
                        'pt-BR'
                      )}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-sm">
                      R$ {brl(p.valor)}
                    </div>
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider ${
                        p.situacao === 'paga'
                          ? 'text-[#2E7D4F]'
                          : p.situacao === 'vencida'
                          ? 'text-[#B00063]'
                          : 'text-[#6E6E68]'
                      }`}
                    >
                      {p.situacao === 'paga'
                        ? 'paga'
                        : p.situacao === 'vencida'
                        ? 'vencida'
                        : 'em aberto'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {aba !== 'financeiro' && aba !== 'estampa' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <Cartao rotulo="PEDIDOS" valor={String(r.pedidos)} />
          <Cartao rotulo="FATURAMENTO" valor={`R$ ${brl(r.faturamento)}`} />
          <Cartao rotulo="METRAGEM" valor={`${brl(r.metragem)} m`} />
          <Cartao rotulo="TICKET MÉDIO" valor={`R$ ${brl(r.ticketMedio)}`} />
          <Cartao rotulo="UNIDADES" valor={String(r.unidades)} />
          <Cartao
            rotulo="REIMPRESSÕES"
            valor={String(r.reimpressoes)}
            alerta={r.reimpressoes > 0}
          />
          <Cartao
            rotulo="CANCELADOS"
            valor={String(r.cancelados)}
            alerta={r.cancelados > 0}
          />
          <Cartao
            rotulo="VALOR CANCELADO"
            valor={`R$ ${brl(r.valorCancelado)}`}
            alerta={r.valorCancelado > 0}
          />
        </div>
      )}

      {aba === 'estampa' ? null : aba !== 'financeiro' && relatorio.pedidos.length === 0 ? (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-6">
          <p className="text-sm text-[#6E6E68]">
            Nenhum pedido no período com esses filtros.
          </p>
        </div>
      ) : (
        <>
          {aba === 'pedidos' && (
          <>
          <Titulo>POR STATUS</Titulo>
          <div className="space-y-1.5">
            {relatorio.porStatus.map((s) => (
              <div
                key={s.status}
                className="flex items-center justify-between gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5"
              >
                <span className="text-sm truncate">{s.label}</span>
                <span className="flex items-baseline gap-3 shrink-0">
                  <span className="font-mono text-sm">{s.quantidade}</span>
                  <span className="font-mono text-xs text-[#6E6E68]">
                    R$ {brl(s.total)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          </>
          )}

          {aba === 'clientes' && (
          <>
          <Titulo>POR CLIENTE</Titulo>
          <div className="space-y-1.5">
            {relatorio.porCliente.map((c) => (
              <div
                key={c.clienteId}
                className="flex items-center justify-between gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5"
              >
                <span className="text-sm truncate flex-1 min-w-0">
                  {c.cliente}
                </span>
                <span className="flex items-baseline gap-3 shrink-0 font-mono text-xs text-[#6E6E68]">
                  <span>{c.pedidos} ped.</span>
                  <span>{brl(c.metragem)} m</span>
                  <span className="text-sm font-bold text-[#131A2E]">
                    R$ {brl(c.total)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          </>
          )}

          {aba === 'sku' && relatorio.artes.length > 0 && (
            <>
              <Titulo>ARTES MAIS PEDIDAS</Titulo>
              <div className="space-y-1.5">
                {relatorio.artes.map((a) => (
                  <div
                    key={a.sku}
                    className="flex items-center justify-between gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs text-[#6E6E68]">
                        {a.sku}
                      </span>{' '}
                      <span className="text-sm">{a.nome}</span>
                    </span>
                    <span className="font-mono text-xs text-[#6E6E68] shrink-0">
                      {a.unidades} un · {a.pedidos} ped.
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {aba === 'pedidos' && relatorio.ajustes.length > 0 && (
            <>
              <Titulo>AJUSTES DE QUANTIDADE</Titulo>
              <div className="space-y-1.5">
                {relatorio.ajustes.map((a, i) => (
                  <div
                    key={i}
                    className="bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm truncate">
                        <span className="font-mono text-xs text-[#6E6E68]">
                          {a.numero}
                        </span>{' '}
                        {a.cliente} · {a.sku}
                      </span>
                      <span className="font-mono text-xs text-[#B00063] shrink-0">
                        {a.de} → {a.para} un
                      </span>
                    </div>
                    <p className="text-xs text-[#6E6E68] mt-1">{a.motivo}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {aba === 'pedidos' && (
          <>
          <Titulo>PEDIDOS</Titulo>
          <div className="space-y-1.5">
            {relatorio.pedidos.map((p) => (
              <Link
                key={p.id}
                href={`/admin/pedidos/${p.id}`}
                className="flex items-center gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5 hover:border-[#131A2E]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-xs text-[#6E6E68] shrink-0">
                      {p.numero} ·
                    </span>
                    <span className="text-sm font-semibold truncate">
                      {p.cliente}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${
                      p.cancelado ? 'text-[#B00063]' : 'text-[#6E6E68]'
                    }`}
                  >
                    {p.statusLabel} ·{' '}
                    {new Date(p.criadoEm).toLocaleDateString('pt-BR')}
                    {p.reimpressoes > 0 && ` · ${p.reimpressoes}ª reimpressão`}
                  </span>
                </div>
                <div className="text-right shrink-0 font-mono text-xs text-[#6E6E68]">
                  <div>{p.unidades} un</div>
                  {p.total > 0 && (
                    <div className="font-bold text-sm text-[#131A2E]">
                      R$ {brl(p.total)}
                    </div>
                  )}
                </div>
                <span className="text-[#DDDCD5] shrink-0">›</span>
              </Link>
            ))}
          </div>
          </>
          )}
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

function Cartao({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-3">
      <div className="text-[9px] tracking-[0.14em] text-[#6E6E68]">{rotulo}</div>
      <div
        className={`font-mono font-bold text-base sm:text-lg mt-1 ${
          alerta ? 'text-[#B00063]' : 'text-[#131A2E]'
        }`}
      >
        {valor}
      </div>
    </div>
  )
}
