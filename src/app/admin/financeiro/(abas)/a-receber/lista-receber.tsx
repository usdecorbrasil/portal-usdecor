'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME } from '@/components/estilo-lista'
import { confirmarRecebimentos, type ItemRecebimento } from '@/app/actions/recebimentos'
import type { ParcelaAReceber } from '@/app/actions/clientes'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

const ROTULOS_STATUS: Record<string, string> = {
  aguardando: 'Aguardando confirmação', recebido: 'Pedido confirmado', impressao: 'Impressão', estampando: 'Estampando',
  pronto: 'Estampa pronta', faturado: 'Faturado', nf_emitida: 'Nota fiscal emitida', corte_costura: 'Em corte / costura',
  expedido: 'Expedido', entregue: 'Entregue', fechado: 'Pedido fechado',
}
const ORDEM_STATUS = ['aguardando', 'recebido', 'impressao', 'estampando', 'pronto', 'faturado', 'nf_emitida', 'expedido', 'entregue', 'fechado']
const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista', boleto_parcelado: 'Boleto parcelado', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
}

const chave = (p: ParcelaAReceber) => `${p.pedidoId}-${p.numeroParcela ?? 'unico'}`
const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm bg-white w-full outline-none focus:border-[#131A2E]'
const rotulo = 'block text-[10px] font-mono tracking-wider text-[#6E6E68]'
const botao = 'rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50'

/**
 * A receber com controle financeiro (pedido do dono, 12/10/2026): caixa de
 * seleção nas cobranças em aberto para confirmar o recebimento em lote, e o
 * detalhe de cada uma com o botão "Confirmar recebimento". A baixa automática
 * pelo Bling continua; isto é para o que o financeiro já conferiu.
 */
export default function ListaReceber({ parcelas, hoje }: { parcelas: ParcelaAReceber[]; hoje: string }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<string | null>(null)
  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const [aberta, setAberta] = useState<string | null>(null)
  const [recebidoEm, setRecebidoEm] = useState(hoje)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [pendente, iniciar] = useTransition()

  const grupos = useMemo(() => {
    const m = new Map<string, ParcelaAReceber[]>()
    parcelas.forEach((p) => m.set(p.status, [...(m.get(p.status) ?? []), p]))
    return m
  }, [parcelas])
  const statusDisponiveis = ORDEM_STATUS.filter((s) => grupos.has(s))
  const statusVisiveis = filtro ? [filtro] : statusDisponiveis

  const abertas = parcelas.filter((p) => !p.pagoEm)
  const selecionadas = abertas.filter((p) => selecao.has(chave(p)))
  const totalSelecionado = selecionadas.reduce((s, p) => s + p.valor, 0)

  function alternar(p: ParcelaAReceber) {
    setSelecao((s) => {
      const n = new Set(s)
      const k = chave(p)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }
  function selecionarTodas(lista: ParcelaAReceber[], marcar: boolean) {
    setSelecao((s) => {
      const n = new Set(s)
      lista.filter((p) => !p.pagoEm).forEach((p) => (marcar ? n.add(chave(p)) : n.delete(chave(p))))
      return n
    })
  }

  function confirmar(itens: ItemRecebimento[], quando: string, texto: string) {
    setErro('')
    setAviso('')
    iniciar(async () => {
      const r = await confirmarRecebimentos(itens, quando, texto.trim() || null)
      if (!r.ok) return setErro(r.erro)
      setSelecao(new Set())
      setAberta(null)
      setObs('')
      setAviso(`${r.feitas} recebimento${r.feitas > 1 ? 's' : ''} confirmado${r.feitas > 1 ? 's' : ''}.${r.erros.length ? ' Não deu para confirmar: ' + r.erros.join(' · ') : ''}`)
      router.refresh()
    })
  }

  const paraItem = (p: ParcelaAReceber): ItemRecebimento => ({ pedidoId: p.pedidoId, numeroParcela: p.numeroParcela, valor: p.valor, numero: p.numero })

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <BotaoFiltro ativo={filtro === null} onClick={() => setFiltro(null)} rotulo="Todos" contagem={parcelas.length} />
        {statusDisponiveis.map((s) => (
          <BotaoFiltro key={s} ativo={filtro === s} onClick={() => setFiltro(s)} rotulo={ROTULOS_STATUS[s] ?? s} contagem={grupos.get(s)?.length ?? 0} />
        ))}
      </div>

      {aviso && <p className="text-xs text-[#2E7D4F] bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm px-3 py-2 mb-3">{aviso}</p>}
      {erro && !aberta && <p className="text-xs text-[#B00063] bg-white border border-[#B00063] rounded-sm px-3 py-2 mb-3">{erro}</p>}

      {selecionadas.length > 0 && (
        <div className="sticky top-2 z-20 bg-[#131A2E] text-white rounded-sm px-3 py-2.5 mb-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <p className="text-xs flex-1 min-w-0">
              <span className="font-semibold">{selecionadas.length} cobrança{selecionadas.length > 1 ? 's' : ''} selecionada{selecionadas.length > 1 ? 's' : ''}</span>
              {' · '}<span className="font-mono">R$ {brl(totalSelecionado)}</span>
            </p>
            <label className="text-[10px] font-mono tracking-wider text-white/70">RECEBIDO EM
              <input type="date" value={recebidoEm} max={hoje} onChange={(e) => setRecebidoEm(e.target.value)} className="block border border-white/30 rounded-sm px-2 py-1 text-xs bg-white text-[#131A2E]" />
            </label>
            <label className="text-[10px] font-mono tracking-wider text-white/70 flex-1 min-w-0">OBSERVAÇÃO (opcional)
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: Pix conferido no extrato" className="block w-full border border-white/30 rounded-sm px-2 py-1 text-xs bg-white text-[#131A2E]" />
            </label>
            <button disabled={pendente} onClick={() => confirmar(selecionadas.map(paraItem), recebidoEm, obs)} className={botao + ' bg-[#2E7D4F] text-white'}>
              {pendente ? 'CONFIRMANDO…' : 'CONFIRMAR RECEBIMENTO'}
            </button>
            <button disabled={pendente} onClick={() => setSelecao(new Set())} className="text-xs underline text-white/80 pb-2">limpar</button>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {statusVisiveis.map((status) => {
          const itens = (grupos.get(status) ?? []).slice().sort((a, b) => {
            if (!a.vencimento) return 1
            if (!b.vencimento) return -1
            return a.vencimento.localeCompare(b.vencimento)
          })
          if (!itens.length) return null
          const abertasDoGrupo = itens.filter((p) => !p.pagoEm)
          const todasMarcadas = abertasDoGrupo.length > 0 && abertasDoGrupo.every((p) => selecao.has(chave(p)))

          return (
            <section key={status} data-busca-grupo>
              <h2 className="flex items-center gap-2 px-2.5 py-1 border border-b-0 border-[#E4E3DC] bg-[#FCFCFA] rounded-t-sm text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6E68]">
                {ROTULOS_STATUS[status] ?? status}
                <span data-busca-contagem className="font-mono font-semibold text-[11px] opacity-60">{itens.length}</span>
              </h2>
              <div className={CAIXA + ' rounded-t-none'}>
                <div className={CABECALHO}>
                  <span className="w-7 shrink-0 flex items-center">
                    {abertasDoGrupo.length > 0 && (
                      <input type="checkbox" aria-label="Selecionar todas em aberto" checked={todasMarcadas} onChange={(e) => selecionarTodas(itens, e.target.checked)} className="accent-[#131A2E]" />
                    )}
                  </span>
                  <span className="w-16 shrink-0">Nº</span>
                  <span className="flex-1 min-w-0">Cliente</span>
                  <span className="w-28 shrink-0 hidden sm:block">Forma</span>
                  <span className="w-16 shrink-0 text-right">Venc.</span>
                  <span className="w-20 shrink-0 text-right">Valor</span>
                </div>
                <div className={CORPO}>
                  {itens.map((p) => {
                    const k = chave(p)
                    const paga = !!p.pagoEm
                    return (
                      <div key={k} data-busca={`${p.numero} ${p.clienteNome}`} className="relative">
                        <span aria-hidden className={'absolute left-0 top-0 bottom-0 w-px ' + (p.vencida ? 'bg-[#B00063]' : paga ? 'bg-[#8CB399]' : 'bg-[#C4A868]')} />
                        <div className={'flex items-center gap-2 px-2.5 py-1.5 ' + (paga ? 'bg-[#FAFAF7] opacity-70' : 'bg-white hover:bg-[#FAFAF8]')}>
                          <span className="w-5 shrink-0 flex items-center">
                            {!paga && <input type="checkbox" aria-label={`Selecionar pedido ${p.numero}`} checked={selecao.has(k)} onChange={() => alternar(p)} className="accent-[#131A2E]" />}
                          </span>
                          <button type="button" onClick={() => { setErro(''); setAberta(aberta === k ? null : k) }} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                            <span className={NUM + ' w-16 shrink-0 text-[#6E6E68]'}>
                              {p.numero}{p.numeroParcela && p.totalParcelas ? ` ${p.numeroParcela}/${p.totalParcelas}` : ''}
                            </span>
                            <span className={NOME + ' flex-1 min-w-0'}>{p.clienteNome}</span>
                            {p.vencida && <span className={ETIQUETA + ' bg-[#B00063] text-white'}>vencida</span>}
                            {paga && <span className={ETIQUETA + ' bg-[#E3F0E8] text-[#2E7D4F]'}>recebido</span>}
                            <span className="w-28 shrink-0 text-[10px] text-[#9B9A93] truncate hidden sm:block">{ROTULOS_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}</span>
                            <span className={NUM + ' w-16 shrink-0 text-right ' + (p.vencida ? 'font-bold text-[#B00063]' : 'text-[#6E6E68]')}>{p.vencimento ? dataBr(p.vencimento) : '—'}</span>
                            <span className={NUM + ' w-20 shrink-0 text-right font-semibold ' + (p.vencida ? 'text-[#B00063]' : 'text-[#131A2E]')}>{brl(p.valor)}</span>
                          </button>
                        </div>
                        {aberta === k && (
                          <Painel p={p} hoje={hoje} pendente={pendente} erro={erro} onConfirmar={(quando, texto) => confirmar([paraItem(p)], quando, texto)} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Painel({ p, hoje, pendente, erro, onConfirmar }: { p: ParcelaAReceber; hoje: string; pendente: boolean; erro: string; onConfirmar: (quando: string, texto: string) => void }) {
  const [quando, setQuando] = useState(hoje)
  const [texto, setTexto] = useState('')
  return (
    <div className="px-2.5 pb-3 pt-1 bg-[#FAFAF8] border-t border-[#EFEEE8] text-sm">
      <p className="text-xs text-[#6E6E68] mb-2">
        Pedido #{p.numero} · {p.clienteNome} · {ROTULOS_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento}
        {p.numeroParcela && p.totalParcelas ? ` · parcela ${p.numeroParcela} de ${p.totalParcelas}` : ''}
        {p.vencimento ? ` · vence ${dataBr(p.vencimento)}` : ' · sem vencimento (cobrança a emitir)'}
        {p.pagoEm ? ` · recebido em ${dataBr(p.pagoEm)}` : ''}
        {' · '}<Link href={`/admin/pedidos/${p.pedidoId}`} className="text-[#0090D8] hover:underline">abrir o pedido</Link>
      </p>
      {!p.pagoEm && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className={rotulo}>RECEBIDO EM
            <input type="date" value={quando} max={hoje} onChange={(e) => setQuando(e.target.value)} className={campo} />
          </label>
          <label className={rotulo}>VALOR
            <input value={brl(p.valor)} readOnly className={campo + ' bg-[#F2F1ED]'} />
          </label>
          <label className={rotulo}>OBSERVAÇÃO (opcional)
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: Pix conferido" className={campo} />
          </label>
          <button disabled={pendente} onClick={() => onConfirmar(quando, texto)} className={botao + ' bg-[#2E7D4F] text-white'}>
            {pendente ? 'CONFIRMANDO…' : 'CONFIRMAR RECEBIMENTO'}
          </button>
        </div>
      )}
      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
    </div>
  )
}

function BotaoFiltro({ ativo, onClick, rotulo: r, contagem }: { ativo: boolean; onClick: () => void; rotulo: string; contagem: number }) {
  return (
    <button onClick={onClick} className={`text-xs font-semibold tracking-wide px-3 py-2 rounded-sm border ${ativo ? 'bg-[#131A2E] text-white border-[#131A2E]' : 'bg-white text-[#6E6E68] border-[#DDDCD5] hover:border-[#131A2E]'}`}>
      {r}
      <span className={`ml-1.5 font-mono ${ativo ? 'text-white/70' : 'text-[#6E6E68]'}`}>{contagem}</span>
    </button>
  )
}
