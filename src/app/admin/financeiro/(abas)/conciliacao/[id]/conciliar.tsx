'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'
import { conciliarLancamento, desfazerConciliacao, excluirExtrato, fecharExtrato, ignorarLancamento, type ExtratoAberto, type Lancamento } from '@/app/actions/conciliacao'
import type { ContaCandidata } from '@/lib/conciliacao/casar'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm bg-white w-full outline-none focus:border-[#131A2E]'
const botao = 'rounded-sm px-3 py-1.5 text-[11px] font-bold tracking-wide disabled:opacity-50'

type Filtro = 'pendentes' | 'conciliados' | 'ignorados' | 'todos'

const rotuloConta = (c: ContaCandidata) =>
  `${c.descricao}${c.parcelas > 1 ? ` (${c.parcela}/${c.parcelas})` : ''} · R$ ${brl(c.valor)} · vence ${dataBr(c.vencimento)}${c.pagoEm ? ` · paga ${dataBr(c.pagoEm)}` : ' · em aberto'}`

/**
 * Tela de um extrato: lançamento a lançamento, com a sugestão do portal
 * (conta a pagar ou cobrança), vincular com baixa opcional, ignorar com
 * motivo, desfazer, e fechar quando não sobra pendência.
 */
export default function Conciliar({ extrato }: { extrato: ExtratoAberto }) {
  const router = useRouter()
  const { resumo, lancamentos } = extrato
  const [filtro, setFiltro] = useState<Filtro>(resumo.pendentes ? 'pendentes' : 'todos')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const visiveis = useMemo(
    () => lancamentos.filter((l) => (filtro === 'todos' ? true : filtro === 'pendentes' ? l.situacao === 'pendente' : filtro === 'conciliados' ? l.situacao === 'conciliado' : l.situacao === 'ignorado')),
    [lancamentos, filtro]
  )
  const conciliadosValor = lancamentos.filter((l) => l.situacao === 'conciliado').reduce((s, l) => s + l.valor, 0)
  const pendentesValor = lancamentos.filter((l) => l.situacao === 'pendente').reduce((s, l) => s + l.valor, 0)

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) {
    setErro('')
    iniciar(async () => {
      const r = await acao()
      if (!r.ok) return setErro(r.erro)
      depois?.()
      router.refresh()
    })
  }

  const contador = (f: Filtro) =>
    f === 'todos' ? lancamentos.length : lancamentos.filter((l) => (f === 'pendentes' ? l.situacao === 'pendente' : f === 'conciliados' ? l.situacao === 'conciliado' : l.situacao === 'ignorado')).length

  return (
    <div className="mt-2">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-[#131A2E]">
            {resumo.tipo === 'cartao' ? `Fatura · ${resumo.cartao ?? 'cartão'}` : `Extrato · ${resumo.origem ?? 'banco'}`}
          </h2>
          <p className="text-xs text-[#6E6E68] mt-0.5">
            {dataBr(resumo.periodoInicio)} a {dataBr(resumo.periodoFim)} · {resumo.total} lançamentos · {resumo.modo === 'ofx' ? 'OFX' : 'lido por IA'} · importado em {dataBr(resumo.criadoEm)}
            {resumo.fechadoEm && <> · <span className="text-[#2E7D4F] font-semibold">fechado em {dataBr(resumo.fechadoEm)}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {resumo.fechadoEm ? (
            <button disabled={pendente} onClick={() => executar(() => fecharExtrato(resumo.id, false))} className={botao + ' border border-[#131A2E] bg-white'}>REABRIR</button>
          ) : (
            <button disabled={pendente || resumo.pendentes > 0} title={resumo.pendentes ? 'Ainda há lançamentos pendentes' : undefined} onClick={() => executar(() => fecharExtrato(resumo.id, true))} className={botao + ' bg-[#2E7D4F] text-white'}>
              ✓ FECHAR EXTRATO
            </button>
          )}
          {!resumo.fechadoEm && resumo.conciliados === 0 && (
            <button disabled={pendente} onClick={() => { if (confirm('Excluir este extrato importado? Os lançamentos dele somem; as contas e cobranças não mudam.')) executar(() => excluirExtrato(resumo.id), () => router.push('/admin/financeiro/conciliacao')) }} className={botao + ' border border-[#B00063] text-[#B00063] bg-white'}>
              EXCLUIR
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <Quadro rotulo="ENTRADAS" valor={`R$ ${brl(resumo.entradas)}`} cor="text-[#2E7D4F]" />
        <Quadro rotulo="SAÍDAS" valor={`R$ ${brl(resumo.saidas)}`} cor="text-[#B00063]" />
        <Quadro rotulo="CONCILIADOS" valor={`${resumo.conciliados}`} detalhe={`R$ ${brl(conciliadosValor)}`} />
        <Quadro rotulo="PENDENTES" valor={`${resumo.pendentes}`} detalhe={`R$ ${brl(pendentesValor)}`} cor={resumo.pendentes ? 'text-[#8A6100]' : 'text-[#2E7D4F]'} />
        <Quadro rotulo="IGNORADOS" valor={`${resumo.ignorados}`} />
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {(['pendentes', 'conciliados', 'ignorados', 'todos'] as Filtro[]).map((f) => (
          <button key={f} onClick={() => setFiltro(f)} className={'text-xs px-2.5 py-1.5 rounded-sm border ' + (filtro === f ? 'bg-[#131A2E] text-white border-[#131A2E]' : 'bg-white border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E]')}>
            {f[0].toUpperCase() + f.slice(1)} <span className="font-mono opacity-70">{contador(f)}</span>
          </button>
        ))}
      </div>

      {erro && <p className="text-xs text-[#B00063] bg-white border border-[#B00063] rounded-sm px-3 py-2 mb-3">{erro}</p>}

      {visiveis.length === 0 ? (
        <div className={VAZIO}>{filtro === 'pendentes' ? 'Nada pendente: tudo conferido.' : 'Nenhum lançamento neste filtro.'}</div>
      ) : (
        <div className={CAIXA}>
          <div className={CABECALHO + ' hidden sm:flex'}>
            <span className="w-20">Data</span>
            <span className="flex-1">Lançamento</span>
            <span className="w-24 text-right">Valor</span>
            <span className="w-28 text-right">Situação</span>
          </div>
          <div className={CORPO}>
            {visiveis.map((l) => (
              <Linha key={l.id} l={l} extrato={extrato} fechado={!!resumo.fechadoEm} pendente={pendente} executar={executar} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Quadro({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm px-3 py-2">
      <p className="text-[9px] font-mono tracking-wider text-[#9B9A93]">{rotulo}</p>
      <p className={'font-mono font-semibold text-base ' + (cor ?? 'text-[#131A2E]')}>{valor}</p>
      {detalhe && <p className="text-[11px] text-[#6E6E68]">{detalhe}</p>}
    </div>
  )
}

function Linha({ l, extrato, fechado, pendente, executar }: { l: Lancamento; extrato: ExtratoAberto; fechado: boolean; pendente: boolean; executar: (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) => void }) {
  const [aberta, setAberta] = useState(l.situacao === 'pendente' && l.certeza !== 'nenhuma')
  const [modo, setModo] = useState<'vincular' | 'ignorar' | null>(null)
  const [escolha, setEscolha] = useState<string>(() => l.contas[0]?.candidato.id ?? '')
  const [busca, setBusca] = useState('')
  const [baixar, setBaixar] = useState(true)
  const [texto, setTexto] = useState('')
  const [obs, setObs] = useState('')

  const etiqueta =
    l.situacao === 'conciliado'
      ? { t: 'conciliado', cls: 'bg-[#E6F2EA] text-[#2E7D4F]' }
      : l.situacao === 'ignorado'
        ? { t: 'ignorado', cls: 'bg-[#EFEEE8] text-[#6E6E68]' }
        : l.certeza === 'alta'
          ? { t: 'sugestão forte', cls: 'bg-[#E6F2EA] text-[#2E7D4F]' }
          : l.certeza === 'media'
            ? { t: 'parece ser…', cls: 'bg-[#FFFBEE] text-[#8A6100]' }
            : { t: 'sem sugestão', cls: 'bg-[#FBEAF0] text-[#B00063]' }
  const tarja = l.situacao === 'conciliado' ? 'bg-[#8CB399]' : l.situacao === 'ignorado' ? 'bg-[#BDBCB5]' : l.tipo === 'entrada' ? 'bg-[#2E7D4F]' : 'bg-[#B00063]'

  // Candidatas para a busca manual (além das sugeridas)
  const q = busca.trim().toLowerCase()
  const contasBusca = q.length >= 2 ? extrato.contas.filter((c) => `${c.descricao} ${c.fornecedor ?? ''} ${c.valor}`.toLowerCase().includes(q)).slice(0, 15) : []

  const sugeridasContas = l.contas.map((s) => s.candidato)
  const opcoesContas = [...sugeridasContas, ...contasBusca.filter((c) => !sugeridasContas.some((s) => s.id === c.id))]
  const alvoConta = l.tipo === 'saida' ? opcoesContas.find((c) => c.id === escolha) : undefined
  const alvoAberto = alvoConta ? !alvoConta.pagoEm : false

  function vincular() {
    if (!alvoConta) return
    executar(
      () => conciliarLancamento(l.id, alvoConta.id, baixar && alvoAberto, obs || null, extrato.resumo.id),
      () => { setModo(null); setAberta(false) }
    )
  }

  return (
    <div data-busca={l.descricao} className="relative">
      <span className={'absolute left-0 top-0 bottom-0 w-px ' + tarja} />
      <button onClick={() => setAberta((v) => !v)} className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 px-2.5 py-1.5 bg-white hover:bg-[#FAFAF8]">
        <span className="flex items-center gap-2 sm:contents">
          <span className={NUM + ' sm:w-20 text-[#6E6E68]'}>{dataBr(l.data)}</span>
          <span className="flex-1 min-w-0">
            <span className={NOME + ' block truncate'}>{l.descricao}</span>
            {l.vinculo && <span className="block text-[11px] text-[#2E7D4F] truncate">↳ {l.vinculo}</span>}
            {l.situacao === 'ignorado' && l.observacao && <span className="block text-[11px] text-[#6E6E68] truncate">↳ {l.observacao}</span>}
            {l.situacao === 'pendente' && l.certeza !== 'nenhuma' && (
              <span className="block text-[11px] text-[#6E6E68] truncate">
                ↳ {rotuloConta(l.contas[0].candidato)}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2 sm:contents">
          <span className={NUM + ' sm:w-24 sm:text-right font-semibold ' + (l.tipo === 'entrada' ? 'text-[#2E7D4F]' : 'text-[#B00063]')}>{l.tipo === 'entrada' ? '+' : '−'} {brl(l.valor)}</span>
          <span className="sm:w-28 sm:text-right"><span className={ETIQUETA + ' ' + etiqueta.cls}>{etiqueta.t}</span></span>
        </span>
      </button>

      {aberta && (
        <div className="px-2.5 pb-3 pt-1 bg-[#FAFAF8] border-t border-[#EFEEE8] text-sm">
          {l.documento && <p className="text-[11px] text-[#9B9A93] mb-1">documento {l.documento}</p>}

          {l.situacao !== 'pendente' && !fechado && (
            <div className="flex flex-wrap gap-3 text-xs">
              <button disabled={pendente} onClick={() => executar(() => desfazerConciliacao(l.id, extrato.resumo.id))} className="text-[#B00063] hover:underline">
                desfazer {l.situacao === 'conciliado' ? 'vínculo' : 'ignorar'}
              </button>
              {l.situacao === 'conciliado' && <span className="text-[#9B9A93]">a baixa feita na conta fica; estorne em A pagar se precisar</span>}
            </div>
          )}

          {l.situacao === 'pendente' && !fechado && (
            <>
              <div className="flex flex-wrap gap-3 text-xs mb-2">
                {l.tipo === 'saida' ? (
                  <button onClick={() => setModo(modo === 'vincular' ? null : 'vincular')} className={modo === 'vincular' ? 'font-bold underline' : 'text-[#0090D8] hover:underline'}>
                    vincular a uma conta a pagar
                  </button>
                ) : (
                  // Entradas casam com os repasses dos marketplaces quando o módulo de pedidos chegar
                  <span className="text-[#9B9A93]">entrada: o vínculo com repasses dos marketplaces vem com o módulo de pedidos</span>
                )}
                <button onClick={() => setModo(modo === 'ignorar' ? null : 'ignorar')} className={modo === 'ignorar' ? 'font-bold underline' : 'text-[#6E6E68] hover:underline'}>ignorar (não entra)</button>
                {l.tipo === 'saida' && (
                  <Link href="/admin/estoque/despesas/nova" target="_blank" className="text-[#6E6E68] hover:underline">não está lançado: lançar nota ↗</Link>
                )}
              </div>

              {l.tipo === 'saida' && (modo === 'vincular' || (modo === null && l.certeza !== 'nenhuma')) && (
                <div className="space-y-2">
                  {opcoesContas.length > 0 && (
                    <select value={escolha} onChange={(e) => setEscolha(e.target.value)} className={campo}>
                      {opcoesContas.map((c) => {
                        const s = l.contas.find((x) => x.candidato.id === c.id)
                        return <option key={c.id} value={c.id}>{rotuloConta(c)}{s ? ` — ${s.motivo}` : ''}</option>
                      })}
                    </select>
                  )}
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="procurar outra conta (fornecedor, descrição, valor)…" className={campo} />
                  {q.length >= 2 && contasBusca.length === 0 && (
                    <p className="text-[11px] text-[#8A6100]">Nada encontrado com esse texto. Se a compra não foi lançada, lance a nota primeiro.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {alvoAberto && (
                      <label className="text-xs flex items-center gap-1.5">
                        <input type="checkbox" checked={baixar} onChange={(e) => setBaixar(e.target.checked)} className="accent-[#131A2E]" />
                        dar baixa na conta com a data e o valor do extrato
                      </label>
                    )}
                    {alvoConta && !alvoAberto && <span className="text-xs text-[#6E6E68]">já estava paga: só vincula</span>}
                    <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="observação (opcional)" className={campo + ' sm:w-64'} />
                    <button disabled={pendente || !alvoConta} onClick={vincular} className={botao + ' bg-[#131A2E] text-white'}>
                      {pendente ? 'SALVANDO…' : 'VINCULAR'}
                    </button>
                  </div>
                </div>
              )}

              {modo === 'ignorar' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="por quê? ex.: tarifa bancária, transferência entre contas, pagamento da fatura" className={campo + ' flex-1 min-w-[16rem]'} />
                  <button disabled={pendente || texto.trim().length < 3} onClick={() => executar(() => ignorarLancamento(l.id, texto.trim(), extrato.resumo.id), () => setModo(null))} className={botao + ' border border-[#131A2E] bg-white'}>
                    IGNORAR
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

