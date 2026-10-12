'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NOME, NUM, VAZIO } from '@/components/estilo-lista'
import { ativarCartao, criarCartao, editarCartao, excluirCartao } from '@/app/actions/cartoes'
import { vencimentoDaFatura, type CartaoCredito } from '@/lib/contas-pagar/cartoes'

const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm outline-none focus:border-[#131A2E] bg-white w-full'
const rotulo = 'block text-[10px] font-mono tracking-wider text-[#6E6E68]'
const botao = 'rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50'
const dataBr = (iso: string) => iso.split('-').reverse().join('/')

type Form = { nome: string; final: string; diaFechamento: string; diaVencimento: string }
const vazio = (): Form => ({ nome: '', final: '', diaFechamento: '', diaVencimento: '' })
const doCartao = (c: CartaoCredito): Form => ({ nome: c.nome, final: c.final ?? '', diaFechamento: String(c.diaFechamento), diaVencimento: String(c.diaVencimento) })

/**
 * Configurações → Pagamento → Cartões de crédito da empresa (pedido do dono,
 * 12/10/2026: fica junto das formas de pagamento, não no Financeiro). Nome,
 * final, dia de fechamento e de vencimento da fatura; a regra de em que
 * fatura a compra cai está em `src/lib/contas-pagar/cartoes.ts`.
 */
export default function CartoesCredito({ cartoes, hoje }: { cartoes: CartaoCredito[]; hoje: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | 'novo' | null>(null)
  const [form, setForm] = useState<Form>(vazio())
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function abrir(c: CartaoCredito | null) {
    setErro('')
    setForm(c ? doCartao(c) : vazio())
    setEditando(c ? c.id : 'novo')
  }

  function salvar() {
    setErro('')
    iniciar(async () => {
      const r = editando === 'novo' ? await criarCartao(form) : await editarCartao(editando as string, form)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setEditando(null)
      router.refresh()
    })
  }

  function alternar(c: CartaoCredito) {
    iniciar(async () => {
      const r = await ativarCartao(c.id, !c.ativo)
      if (!r.ok) setErro(r.erro)
      router.refresh()
    })
  }

  function excluir(c: CartaoCredito) {
    const nome = c.final ? `${c.nome} (final ${c.final})` : c.nome
    if (!window.confirm(`Excluir o cartão ${nome}?\n\nSó sai se nunca foi usado em nota ou conta a pagar. Cartão já usado deve ser desativado.`)) return
    setErro('')
    iniciar(async () => {
      const r = await excluirCartao(c.id)
      if (!r.ok) setErro(r.erro)
      router.refresh()
    })
  }

  const fech = Number(form.diaFechamento)
  const venc = Number(form.diaVencimento)
  const exemplo =
    fech >= 1 && fech <= 31 && venc >= 1 && venc <= 31
      ? `Compra feita hoje (${dataBr(hoje)}) vence em ${dataBr(vencimentoDaFatura(hoje, { diaFechamento: fech, diaVencimento: venc }))}.`
      : null

  const ativos = cartoes.filter((c) => c.ativo)
  const resumo = ativos.length
    ? ativos.map((c) => `${c.nome} (fecha ${c.diaFechamento}, vence ${c.diaVencimento})`).join(' · ')
    : 'Nenhum cartão cadastrado — compra no crédito usa o vencimento padrão'

  return (
    <div id="cartoes" className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-3">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="w-full flex items-start justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block font-semibold tracking-tight text-sm">Cartões de crédito da empresa</span>
          <span className="block text-xs text-[#6E6E68] mt-1 leading-relaxed">
            {aberto
              ? 'Cada cartão tem o dia em que a fatura fecha e o dia em que vence. Compra feita até o fechamento entra na fatura do mês; depois dele, na do mês seguinte. Ao lançar uma nota paga no crédito, a equipe escolhe o cartão e as parcelas já vêm com o vencimento real da fatura.'
              : resumo}
          </span>
        </span>
        <span aria-hidden className={`text-[#6E6E68] text-xs shrink-0 mt-0.5 transition-transform ${aberto ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {aberto && (<div className="mt-4">
      {editando && (
        <div className="bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm p-3 mb-4">
          <p className="text-xs font-semibold tracking-wide text-[#131A2E] mb-2">{editando === 'novo' ? 'NOVO CARTÃO' : 'EDITAR CARTÃO'}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className={rotulo + ' col-span-2'}>NOME
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={campo} placeholder="ex.: Nubank PJ" autoFocus />
            </label>
            <label className={rotulo}>FINAL (4 dígitos)
              <input value={form.final} onChange={(e) => setForm({ ...form, final: e.target.value })} className={campo} inputMode="numeric" maxLength={4} placeholder="opcional" />
            </label>
            <span />
            <label className={rotulo}>FECHA NO DIA
              <input value={form.diaFechamento} onChange={(e) => setForm({ ...form, diaFechamento: e.target.value })} className={campo} inputMode="numeric" placeholder="1 a 31" />
            </label>
            <label className={rotulo}>VENCE NO DIA
              <input value={form.diaVencimento} onChange={(e) => setForm({ ...form, diaVencimento: e.target.value })} className={campo} inputMode="numeric" placeholder="1 a 31" />
            </label>
          </div>
          {exemplo && <p className="text-xs text-[#2E7D4F] mt-2">{exemplo}</p>}
          {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={salvar} disabled={pendente} className={botao + ' bg-[#131A2E] text-white'}>
              {pendente ? 'SALVANDO…' : 'SALVAR'}
            </button>
            <button onClick={() => setEditando(null)} disabled={pendente} className={botao + ' border border-[#131A2E] bg-white'}>
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {!editando && (
        <div className="flex justify-end mb-3">
          <button onClick={() => abrir(null)} className={botao + ' bg-[#131A2E] text-white'}>+ NOVO CARTÃO</button>
        </div>
      )}
      {erro && !editando && <p className="text-xs text-[#B00063] mb-2">{erro}</p>}

      {cartoes.length === 0 ? (
        <div className={VAZIO}>Nenhum cartão cadastrado. Sem cartão, a compra no crédito usa o vencimento padrão (um mês após a nota). O cadastro vale para a conferência de notas e para o contas a pagar.</div>
      ) : (
        <div className={CAIXA}>
          <div className={CABECALHO + ' hidden sm:flex'}>
            <span className="flex-1">Cartão</span>
            <span className="w-24 text-right">Fecha dia</span>
            <span className="w-24 text-right">Vence dia</span>
            <span className="w-40 text-right">Compra hoje vence</span>
            <span className="w-44" />
          </div>
          <div className={CORPO}>
            {cartoes.map((c) => (
              <div key={c.id} data-busca className="relative flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-2.5 py-1.5 bg-white">
                <span className={'absolute left-0 top-0 bottom-0 w-px ' + (c.ativo ? 'bg-[#131A2E]' : 'bg-[#BDBCB5]')} />
                <span className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={NOME + (c.ativo ? '' : ' text-[#9B9A93]')}>{c.nome}</span>
                  {c.final && <span className="font-mono text-xs text-[#6E6E68]">final {c.final}</span>}
                  {!c.ativo && <span className={ETIQUETA + ' bg-[#EFEEE8] text-[#6E6E68]'}>inativo</span>}
                </span>
                <span className="flex items-center gap-2 sm:contents text-[11px] text-[#6E6E68]">
                  <span className={NUM + ' sm:w-24 sm:text-right'}><span className="sm:hidden">fecha </span>{c.diaFechamento}</span>
                  <span className={NUM + ' sm:w-24 sm:text-right'}><span className="sm:hidden">vence </span>{c.diaVencimento}</span>
                  <span className={NUM + ' sm:w-40 sm:text-right'}><span className="sm:hidden">compra hoje vence </span>{dataBr(vencimentoDaFatura(hoje, c))}</span>
                </span>
                <span className="sm:w-44 flex gap-3 sm:justify-end text-xs">
                  <button onClick={() => abrir(c)} className="text-[#0090D8] hover:underline">editar</button>
                  <button onClick={() => alternar(c)} disabled={pendente} className="text-[#6E6E68] hover:underline">{c.ativo ? 'desativar' : 'reativar'}</button>
                  <button onClick={() => excluir(c)} disabled={pendente} className="text-[#B00063] hover:underline">excluir</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>)}
    </div>
  )
}
