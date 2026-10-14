'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarSuprimento, editarSuprimento, movimentarSuprimento } from '@/app/actions/suprimentos'
import { UNIDADES } from '@/lib/suprimentos/unidades'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'
import { paraNumeroBr } from '@/lib/numero'

export type SuprimentoLinha = {
  id: string
  nome: string
  unidade: string
  minimo: number
  ativo: boolean
  categoriaId: string | null
  categoria: string | null
  saldo: number
  ultimo: string | null
}

export type MovimentoSuprimento = {
  id: string
  suprimento: string
  unidade: string
  tipo: 'entrada' | 'consumo' | 'ajuste'
  quantidade: number
  custoTotal: number | null
  observacao: string | null
  data: string
}

const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const ROTULO_TIPO = { entrada: 'entrada', consumo: 'consumo', ajuste: 'ajuste' }
const COR_TIPO = {
  entrada: 'bg-[#E3F0E8] text-[#2E7D4F]',
  consumo: 'bg-[#FBF0D9] text-[#8A6A00]',
  ajuste: 'bg-[#E6EDEE] text-[#0090D8]',
}

type Form = { nome: string; unidade: (typeof UNIDADES)[number]; categoriaId: string; minimo: string }
const FORM_VAZIO: Form = { nome: '', unidade: 'un', categoriaId: '', minimo: '' }

const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm outline-none focus:border-[#131A2E] bg-white'
const botao = 'rounded-sm px-3 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-50'

export default function ListaSuprimentos({
  linhas,
  movimentos,
  categorias,
  dono,
}: {
  linhas: SuprimentoLinha[]
  movimentos: MovimentoSuprimento[]
  categorias: { id: string; nome: string }[]
  dono: boolean
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState('')

  // Cadastro (dono)
  const [abrirNovo, setAbrirNovo] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(FORM_VAZIO)

  // Movimento (equipe)
  const [movendo, setMovendo] = useState<string | null>(null)
  const [mov, setMov] = useState<{ tipo: 'consumo' | 'ajuste'; quantidade: string; observacao: string }>({ tipo: 'consumo', quantidade: '', observacao: '' })

  const num = (s: string) => paraNumeroBr(s)

  function depois(r: { ok: boolean; erro?: string }) {
    if (!r.ok) {
      setErro(r.erro ?? 'Falha')
      return
    }
    setErro('')
    setAbrirNovo(false)
    setEditando(null)
    setMovendo(null)
    setForm(FORM_VAZIO)
    setMov({ tipo: 'consumo', quantidade: '', observacao: '' })
    router.refresh()
  }

  function salvarCadastro() {
    const dados = {
      nome: form.nome,
      unidade: form.unidade,
      categoriaId: form.categoriaId || null,
      minimo: form.minimo ? num(form.minimo) : 0,
    }
    iniciar(async () => depois(editando ? await editarSuprimento(editando, dados) : await criarSuprimento(dados)))
  }

  function abrirEdicao(l: SuprimentoLinha) {
    setEditando(l.id)
    setAbrirNovo(true)
    setForm({
      nome: l.nome,
      unidade: l.unidade as Form['unidade'],
      categoriaId: l.categoriaId ?? '',
      minimo: l.minimo ? String(l.minimo) : '',
    })
  }

  const abaixo = linhas.filter((l) => l.ativo && l.minimo > 0 && l.saldo <= l.minimo)

  const formulario = (
    <div className="bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm p-3 mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
      <label className="col-span-2 text-[10px] font-mono tracking-wider text-[#6E6E68]">
        NOME
        <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={campo + ' w-full mt-0.5'} placeholder="Ex.: Zíper invisível 40 cm" autoFocus />
      </label>
      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
        UNIDADE
        <select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value as Form['unidade'] })} className={campo + ' w-full mt-0.5'}>
          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
        CATEGORIA
        <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })} className={campo + ' w-full mt-0.5'}>
          <option value="">—</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
        MÍNIMO (ALERTA)
        <input value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} inputMode="decimal" className={campo + ' w-full mt-0.5'} placeholder="0" />
      </label>
      <div className="col-span-2 sm:col-span-5 flex gap-2 justify-end">
        <button onClick={() => { setAbrirNovo(false); setEditando(null); setForm(FORM_VAZIO); setErro('') }} className={botao + ' border border-[#131A2E] bg-white'}>CANCELAR</button>
        <button onClick={salvarCadastro} disabled={pendente || form.nome.trim().length < 2} className={botao + ' bg-[#131A2E] text-white'}>
          {pendente ? 'SALVANDO…' : editando ? 'SALVAR' : 'CADASTRAR'}
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {abaixo.length > 0 && (
        <div className="bg-[#FBEAF0] border-l-4 border-[#B00063] rounded-r-sm p-3 mb-4">
          <p className="text-sm font-semibold text-[#B00063]">
            {abaixo.length === 1 ? 'Insumo no mínimo' : `${abaixo.length} insumos no mínimo`}
          </p>
          <p className="text-xs text-[#6E6E68] mt-0.5">
            {abaixo.map((l) => `${l.nome}: ${qtd(l.saldo)} ${l.unidade} (mín. ${qtd(l.minimo)})`).join(' · ')}
          </p>
        </div>
      )}

      {erro && <p className="text-xs text-[#B00063] bg-white border border-[#B00063] rounded-sm px-3 py-2 mb-3">{erro}</p>}

      {dono && !abrirNovo && (
        <div className="flex justify-end mb-3">
          <button onClick={() => { setAbrirNovo(true); setEditando(null); setForm(FORM_VAZIO) }} className={botao + ' bg-[#131A2E] text-white'}>
            + NOVO INSUMO
          </button>
        </div>
      )}
      {dono && abrirNovo && formulario}

      {linhas.length === 0 ? (
        <div className={VAZIO} data-busca-vazio>Nenhum insumo cadastrado{dono ? '. Cadastre o primeiro acima.' : '.'}</div>
      ) : (
        <div className={CAIXA} data-busca-grupo>
          <div className={CABECALHO}>
            <span className="flex-1 min-w-0">Insumo</span>
            <span className="w-28 shrink-0 text-right">Saldo</span>
            <span className="w-24 shrink-0 text-right hidden sm:inline">Mínimo</span>
            <span className="w-24 shrink-0 text-right">Ações</span>
          </div>
          <div className={CORPO}>
            {linhas.map((l) => {
              const baixo = l.ativo && l.minimo > 0 && l.saldo <= l.minimo
              return (
                <div key={l.id} data-busca={l.nome} className="bg-white">
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span aria-hidden className={'w-1 self-stretch -my-1.5 shrink-0 ' + (baixo ? 'bg-[#B00063]' : l.ativo ? 'bg-[#85B0AC]' : 'bg-[#DDDCD5]')} />
                    <span className="flex-1 min-w-0">
                      <span className={NOME + ' block'}>{l.nome}</span>
                      <span className="text-[11px] text-[#6E6E68]">
                        {l.categoria ?? 'sem categoria'}
                        {!l.ativo && <span className={ETIQUETA + ' ml-1.5 bg-[#EEEDE7] text-[#6E6E68]'}>inativo</span>}
                        {baixo && <span className={ETIQUETA + ' ml-1.5 bg-[#FBEAF0] text-[#B00063]'}>no mínimo</span>}
                      </span>
                    </span>
                    <span className={NUM + ' w-28 shrink-0 text-right text-sm font-bold ' + (baixo ? 'text-[#B00063]' : '')}>
                      {qtd(l.saldo)} {l.unidade}
                    </span>
                    <span className={NUM + ' w-24 shrink-0 text-right hidden sm:inline text-[#6E6E68]'}>{l.minimo ? qtd(l.minimo) : '—'}</span>
                    <span className="w-24 shrink-0 text-right text-xs space-x-2">
                      <button onClick={() => { setMovendo(movendo === l.id ? null : l.id); setErro('') }} className="text-[#0090D8] hover:underline">lançar</button>
                      {dono && <button onClick={() => abrirEdicao(l)} className="text-[#6E6E68] hover:underline">editar</button>}
                    </span>
                  </div>

                  {movendo === l.id && (
                    <div className="bg-[#FAFAF7] border-t border-[#EFEEE8] px-3 py-2 flex flex-wrap items-end gap-2">
                      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
                        TIPO
                        <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value as 'consumo' | 'ajuste' })} className={campo + ' block mt-0.5'}>
                          <option value="consumo">consumo</option>
                          <option value="ajuste">ajuste (±)</option>
                        </select>
                      </label>
                      <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
                        QUANTIDADE ({l.unidade})
                        <input value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} inputMode="decimal" className={campo + ' block mt-0.5 w-28'} autoFocus />
                      </label>
                      <label className="flex-1 min-w-[10rem] text-[10px] font-mono tracking-wider text-[#6E6E68]">
                        OBSERVAÇÃO
                        <input value={mov.observacao} onChange={(e) => setMov({ ...mov, observacao: e.target.value })} className={campo + ' block mt-0.5 w-full'} placeholder="ex.: contagem do mês" />
                      </label>
                      <button
                        onClick={() => iniciar(async () => depois(await movimentarSuprimento({ suprimentoId: l.id, tipo: mov.tipo, quantidade: num(mov.quantidade), observacao: mov.observacao })))}
                        disabled={pendente || !mov.quantidade}
                        className={botao + ' bg-[#131A2E] text-white'}
                      >
                        {pendente ? 'GRAVANDO…' : 'GRAVAR'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
        ÚLTIMOS MOVIMENTOS
        <span className="flex-1 h-px bg-[#DDDCD5]" />
        <span className="font-mono normal-case tracking-normal text-[#9B9A93]">{movimentos.length}</span>
      </h2>
      {movimentos.length === 0 ? (
        <div className={VAZIO}>Nenhum movimento ainda.</div>
      ) : (
        <div className={CAIXA}>
          <div className={CORPO}>
            {movimentos.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-white">
                <span className={NUM + ' w-24 shrink-0 text-[#6E6E68]'}>{dataHora(m.data)}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm truncate block">{m.suprimento}</span>
                  <span className="text-[11px] text-[#6E6E68] truncate block">
                    {m.observacao ?? ''}
                  </span>
                </span>
                <span className={ETIQUETA + ' ' + COR_TIPO[m.tipo]}>{ROTULO_TIPO[m.tipo]}</span>
                <span className={NUM + ' w-24 shrink-0 text-right font-semibold'}>
                  {m.tipo === 'consumo' ? '−' : m.quantidade < 0 ? '' : '+'}{qtd(m.quantidade)} {m.unidade}
                </span>
                {dono && <span className={NUM + ' w-24 shrink-0 text-right text-[#6E6E68] hidden sm:inline'}>{m.custoTotal != null ? `R$ ${brl(m.custoTotal)}` : ''}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
