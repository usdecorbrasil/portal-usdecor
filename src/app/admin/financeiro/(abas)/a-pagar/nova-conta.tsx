'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarContaPagar } from '@/app/actions/contas-pagar'
import { gerarParcelas, validarParcelas, somarDias, MAX_PARCELAS_CONTA } from '@/lib/contas-pagar/condicoes'

/**
 * Conta lançada à mão, para o que não tem nota de compra: aluguel, energia,
 * internet, parcela de empréstimo. O que tem nota entra por Estoque →
 * Despesas, já com a forma de pagamento.
 */

const num = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const txt = (v: number) => v.toFixed(2).replace('.', ',')
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FORMAS = [
  { chave: 'boleto', rotulo: 'Boleto' },
  { chave: 'credito', rotulo: 'Cartão de crédito' },
  { chave: 'a_pagar', rotulo: 'A pagar (outro combinado)' },
] as const
type Forma = (typeof FORMAS)[number]['chave']

export default function NovaConta({
  categorias,
  hoje,
  abrir = false,
}: {
  categorias: { id: string; nome: string }[]
  hoje: string
  /** Vindo do atalho do dashboard (?nova=1): já abre o formulário. */
  abrir?: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(abrir)
  const caixa = useRef<HTMLDivElement>(null)

  // Atalho: leva o formulário para a vista e põe o cursor na descrição
  useEffect(() => {
    if (!abrir) return
    caixa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    caixa.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [abrir])
  const [descricao, setDescricao] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [forma, setForma] = useState<Forma>('boleto')
  const [total, setTotal] = useState('')
  const [parcelas, setParcelas] = useState<{ vencimento: string; valor: string }[]>([])
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm bg-white w-full outline-none focus:border-[#131A2E]'
  const rotulo = 'block text-[10px] font-mono tracking-wider text-[#6E6E68]'

  const lista = parcelas.length ? parcelas : total ? [{ vencimento: somarDias(hoje, 30), valor: total }] : []
  const parcelasNum = lista.map((p) => ({ vencimento: p.vencimento, valor: num(p.valor) }))
  const erroParcelas = parcelasNum.length ? validarParcelas(parcelasNum, null) : 'Informe o valor.'

  function dividir(qtd: number) {
    const primeiro = lista[0]?.vencimento || somarDias(hoje, 30)
    const valorTotal = num(total) || parcelasNum.reduce((s, p) => s + p.valor, 0)
    if (valorTotal <= 0) return setErro('Informe o valor total antes de dividir.')
    setErro('')
    setParcelas(gerarParcelas(valorTotal, qtd, primeiro).map((p) => ({ vencimento: p.vencimento, valor: txt(p.valor) })))
  }

  function salvar() {
    setErro('')
    if (erroParcelas) return setErro(erroParcelas)
    iniciar(async () => {
      const r = await criarContaPagar({
        descricao,
        fornecedor: fornecedor.trim() || null,
        categoriaId: categoriaId || null,
        forma,
        parcelas: parcelasNum,
        observacao: observacao.trim() || null,
      })
      if (!r.ok) return setErro(r.erro)
      setAberto(false)
      setDescricao('')
      setFornecedor('')
      setCategoriaId('')
      setTotal('')
      setParcelas([])
      setObservacao('')
      if (abrir) router.replace('/admin/financeiro/a-pagar')
      else router.refresh()
    })
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="text-xs font-semibold border border-[#131A2E] rounded-sm px-3 py-2 bg-white hover:bg-[#FAFAF7]">
        + LANÇAR CONTA SEM NOTA
      </button>
    )
  }

  return (
    <div ref={caixa} className="bg-white border border-[#131A2E] rounded-sm p-3 scroll-mt-4">
      <p className="text-[10px] font-mono tracking-wider text-[#131A2E] mb-2">NOVA CONTA A PAGAR</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className={rotulo + ' col-span-2'}>DESCRIÇÃO
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: Aluguel de outubro" className={campo} />
        </label>
        <label className={rotulo + ' col-span-2'}>FORNECEDOR (opcional)
          <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={campo} />
        </label>
        <label className={rotulo + ' col-span-2 sm:col-span-1'}>CATEGORIA
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campo}>
            <option value="">—</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className={rotulo}>FORMA
          <select value={forma} onChange={(e) => setForma(e.target.value as Forma)} className={campo}>
            {FORMAS.map((f) => <option key={f.chave} value={f.chave}>{f.rotulo}</option>)}
          </select>
        </label>
        <label className={rotulo}>VALOR TOTAL
          <input
            value={total}
            onChange={(e) => {
              setTotal(e.target.value)
              if (parcelas.length <= 1) setParcelas([])
            }}
            inputMode="decimal"
            className={campo}
          />
        </label>
        <label className={rotulo}>PARCELAS
          <select value={lista.length || 1} onChange={(e) => dividir(Number(e.target.value))} className={campo}>
            {Array.from({ length: MAX_PARCELAS_CONTA }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}x</option>)}
          </select>
        </label>
      </div>

      {lista.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {lista.map((p, idx) => (
            <div key={idx} className="grid grid-cols-[2.5rem_1fr_1fr] gap-1.5 items-end">
              <span className="font-mono text-xs text-[#6E6E68] pb-2">{idx + 1}/{lista.length}</span>
              <label className={rotulo}>VENCIMENTO
                <input
                  type="date"
                  value={p.vencimento}
                  onChange={(e) => setParcelas(lista.map((x, j) => (j === idx ? { ...x, vencimento: e.target.value } : x)))}
                  className={campo}
                />
              </label>
              <label className={rotulo}>VALOR
                <input
                  value={p.valor}
                  onChange={(e) => setParcelas(lista.map((x, j) => (j === idx ? { ...x, valor: e.target.value } : x)))}
                  inputMode="decimal"
                  className={campo}
                />
              </label>
            </div>
          ))}
          <p className="text-xs text-[#6E6E68]">Total das parcelas: R$ {brl(parcelasNum.reduce((s, p) => s + p.valor, 0))}</p>
        </div>
      )}

      <label className={rotulo + ' mt-2'}>OBSERVAÇÃO (opcional)
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campo} />
      </label>

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
      <div className="flex gap-3 mt-3">
        <button
          onClick={salvar}
          disabled={pendente || descricao.trim().length < 3 || !!erroParcelas}
          className="rounded-sm px-4 py-2 text-xs font-bold tracking-wide bg-[#131A2E] text-white disabled:opacity-50"
        >
          {pendente ? 'SALVANDO…' : 'SALVAR CONTA'}
        </button>
        <button onClick={() => setAberto(false)} className="text-xs text-[#6E6E68] hover:underline">cancelar</button>
      </div>
    </div>
  )
}
