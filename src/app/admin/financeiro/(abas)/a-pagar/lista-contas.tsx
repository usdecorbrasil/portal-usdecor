'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, TITULO_GRUPO, VAZIO } from '@/components/estilo-lista'
import { baixarCsv, paraCsv, numCsv } from '@/components/baixar-csv'
import { ROTULO_CURTO } from '@/lib/contas-pagar/condicoes'
import {
  alterarContaPagar,
  baixarContaPagar,
  cancelarContaPagar,
  estornarContaPagar,
  type ContaPagar,
  type FiltroContas,
} from '@/app/actions/contas-pagar'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => iso.split('-').reverse().join('/')
const num = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const txt = (v: number) => v.toFixed(2).replace('.', ',')

function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

type Grupo = { titulo: string; contas: ContaPagar[]; cor?: string }

export default function ListaContas({
  contas,
  situacao,
  hoje,
}: {
  contas: ContaPagar[]
  situacao: FiltroContas['situacao']
  hoje: string
}) {
  const [aberta, setAberta] = useState<string | null>(null)

  const em7 = somarDias(hoje, 7)
  const grupos: Grupo[] =
    situacao === 'abertas'
      ? [
          { titulo: 'Vencidas', contas: contas.filter((c) => c.vencimento < hoje), cor: 'text-[#B00063]' },
          { titulo: 'Vencem nos próximos 7 dias', contas: contas.filter((c) => c.vencimento >= hoje && c.vencimento <= em7) },
          { titulo: 'Depois', contas: contas.filter((c) => c.vencimento > em7) },
        ]
      : [{ titulo: { pagas: 'Pagas', canceladas: 'Canceladas', todas: 'Todas' }[situacao], contas }]

  function exportar() {
    const linhas = [
      ['Vencimento', 'Descrição', 'Fornecedor', 'Categoria', 'Parcela', 'Forma', 'Valor', 'Situação', 'Pago em', 'Valor pago'],
      ...contas.map((c) => [
        dataBr(c.vencimento),
        c.descricao,
        c.fornecedor ?? '',
        c.categoria ?? '',
        `${c.parcela}/${c.parcelas}`,
        ROTULO_CURTO[c.forma],
        numCsv(c.valor),
        c.canceladaEm ? 'Cancelada' : c.pagoEm ? 'Paga' : c.vencimento < hoje ? 'Vencida' : 'Em aberto',
        c.pagoEm ? dataBr(c.pagoEm) : '',
        c.valorPago != null ? numCsv(c.valorPago) : '',
      ]),
    ]
    baixarCsv(`contas-a-pagar-${situacao}-${hoje}.csv`, paraCsv(linhas))
  }

  if (!contas.length) {
    return <div className={VAZIO + ' mt-4'}>Nenhuma conta {situacao === 'abertas' ? 'em aberto' : 'neste filtro'}.</div>
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <button onClick={exportar} className="text-xs text-[#0090D8] hover:underline">
          baixar CSV ({contas.length})
        </button>
      </div>
      {grupos
        .filter((g) => g.contas.length)
        .map((g) => (
          <div key={g.titulo} data-busca-grupo>
            <div className={TITULO_GRUPO}>
              <span className={g.cor}>{g.titulo}</span>
              <span className="ml-auto font-mono normal-case tracking-normal">
                <span data-busca-contagem>{g.contas.length}</span> · R$ {brl(g.contas.reduce((s, c) => s + (c.valorPago ?? c.valor), 0))}
              </span>
            </div>
            <div className={CAIXA + ' rounded-t-none'}>
              <div className={CABECALHO + ' hidden sm:flex'}>
                <span className="w-20">Vencimento</span>
                <span className="flex-1">Conta</span>
                <span className="w-12 text-right">Parc.</span>
                <span className="w-16">Forma</span>
                <span className="w-24 text-right">Valor</span>
              </div>
              <div className={CORPO}>
                {g.contas.map((c) => (
                  <Linha key={c.id} c={c} hoje={hoje} aberta={aberta === c.id} alternar={() => setAberta(aberta === c.id ? null : c.id)} />
                ))}
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}

function Linha({ c, hoje, aberta, alternar }: { c: ContaPagar; hoje: string; aberta: boolean; alternar: () => void }) {
  const vencida = !c.pagoEm && !c.canceladaEm && c.vencimento < hoje
  const tarja = c.canceladaEm ? 'bg-[#BDBCB5]' : c.pagoEm ? 'bg-[#8CB399]' : vencida ? 'bg-[#B00063]' : 'bg-[#C4A868]'
  const etiqueta = c.canceladaEm
    ? { t: 'cancelada', cls: 'bg-[#EFEEE8] text-[#6E6E68]' }
    : c.pagoEm
      ? { t: `paga ${dataBr(c.pagoEm)}`, cls: 'bg-[#E6F2EA] text-[#2E7D4F]' }
      : vencida
        ? { t: 'vencida', cls: 'bg-[#FBEAF0] text-[#B00063]' }
        : null

  return (
    <div data-busca className="relative">
      <span className={'absolute left-0 top-0 bottom-0 w-px ' + tarja} />
      <button onClick={alternar} className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 px-2.5 py-1.5 bg-white hover:bg-[#FAFAF8]">
        <span className="flex items-center gap-2 sm:contents">
          <span className={NUM + ' sm:w-20 ' + (vencida ? 'text-[#B00063] font-semibold' : '')}>{dataBr(c.vencimento)}</span>
          <span className="flex-1 min-w-0">
            <span className={NOME + ' block'}>{c.descricao}</span>
            <span className="block text-[11px] text-[#6E6E68] truncate">
              {[c.fornecedor && c.fornecedor !== c.descricao.split(' · ')[0] ? c.fornecedor : null, c.categoria, c.despesaId ? 'da nota' : 'lançada à mão']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 sm:contents">
          <span className={NUM + ' sm:w-12 sm:text-right text-[#6E6E68]'}>{c.parcelas > 1 ? `${c.parcela}/${c.parcelas}` : ''}</span>
          <span className="sm:w-16">
            <span className={ETIQUETA + ' bg-[#F2F1ED] text-[#6E6E68]'}>{ROTULO_CURTO[c.forma]}</span>
          </span>
          {etiqueta && <span className={ETIQUETA + ' ' + etiqueta.cls + ' sm:hidden'}>{etiqueta.t}</span>}
          <span className={NUM + ' ml-auto sm:ml-0 sm:w-24 text-right font-semibold'}>R$ {brl(c.valorPago ?? c.valor)}</span>
        </span>
        {etiqueta && <span className={ETIQUETA + ' ' + etiqueta.cls + ' hidden sm:inline'}>{etiqueta.t}</span>}
      </button>
      {aberta && <Painel c={c} hoje={hoje} />}
    </div>
  )
}

type Modo = 'pagar' | 'alterar' | 'cancelar' | 'estornar' | null

function Painel({ c, hoje }: { c: ContaPagar; hoje: string }) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(!c.pagoEm && !c.canceladaEm ? 'pagar' : null)
  const [pagoEm, setPagoEm] = useState(hoje)
  const [valor, setValor] = useState(txt(c.valor))
  const [vencimento, setVencimento] = useState(c.vencimento)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm bg-white w-full outline-none focus:border-[#131A2E]'
  const rotulo = 'block text-[10px] font-mono tracking-wider text-[#6E6E68]'
  const botao = 'rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50'

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro('')
    iniciar(async () => {
      const r = await acao()
      if (!r.ok) return setErro(r.erro)
      setModo(null)
      setTexto('')
      router.refresh()
    })
  }

  const abertaConta = !c.pagoEm && !c.canceladaEm

  return (
    <div className="px-2.5 pb-3 pt-1 bg-[#FAFAF8] border-t border-[#EFEEE8] text-sm">
      {(c.observacao || c.baixaObs || c.canceladaMotivo) && (
        <div className="text-xs text-[#6E6E68] space-y-0.5 mb-2">
          {c.baixaObs && <p>Pagamento: {c.baixaObs}</p>}
          {c.canceladaMotivo && <p>Cancelada: {c.canceladaMotivo}</p>}
          {c.observacao && <p>{c.observacao}</p>}
        </div>
      )}
      {c.pagoEm && c.valorPago != null && c.valorPago !== c.valor && (
        <p className="text-xs text-[#6E6E68] mb-2">
          Valor da conta R$ {brl(c.valor)} · pago R$ {brl(c.valorPago)}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-xs mb-2">
        {abertaConta && (
          <>
            <button onClick={() => setModo('pagar')} className={modo === 'pagar' ? 'font-bold underline' : 'text-[#0090D8] hover:underline'}>registrar pagamento</button>
            <button onClick={() => setModo('alterar')} className={modo === 'alterar' ? 'font-bold underline' : 'text-[#0090D8] hover:underline'}>mudar vencimento ou valor</button>
            <button onClick={() => setModo('cancelar')} className={modo === 'cancelar' ? 'font-bold underline' : 'text-[#B00063] hover:underline'}>cancelar conta</button>
          </>
        )}
        {c.pagoEm && !c.canceladaEm && (
          <button onClick={() => setModo('estornar')} className={modo === 'estornar' ? 'font-bold underline' : 'text-[#B00063] hover:underline'}>estornar pagamento</button>
        )}
      </div>

      {modo === 'pagar' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className={rotulo}>PAGO EM
            <input type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} className={campo} />
          </label>
          <label className={rotulo}>VALOR PAGO
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={campo} />
          </label>
          <label className={rotulo + ' col-span-2'}>OBSERVAÇÃO (opcional)
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: Pix pelo Itaú, juros de atraso" className={campo} />
          </label>
          <button
            disabled={pendente}
            onClick={() => executar(() => baixarContaPagar(c.id, pagoEm, num(valor), texto.trim() || null))}
            className={botao + ' bg-[#131A2E] text-white col-span-2 sm:col-span-1'}
          >
            {pendente ? 'SALVANDO…' : 'CONFIRMAR PAGAMENTO'}
          </button>
        </div>
      )}

      {modo === 'alterar' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className={rotulo}>NOVO VENCIMENTO
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
          </label>
          <label className={rotulo}>VALOR
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={campo} />
          </label>
          <label className={rotulo + ' col-span-2'}>MOTIVO (mín. 10 caracteres)
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="ex.: fornecedor prorrogou o boleto" className={campo} />
          </label>
          <button
            disabled={pendente || texto.trim().length < 10}
            onClick={() => executar(() => alterarContaPagar(c.id, vencimento, num(valor), texto))}
            className={botao + ' bg-[#131A2E] text-white col-span-2 sm:col-span-1'}
          >
            {pendente ? 'SALVANDO…' : 'SALVAR ALTERAÇÃO'}
          </button>
        </div>
      )}

      {(modo === 'cancelar' || modo === 'estornar') && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <label className={rotulo}>MOTIVO (mín. 10 caracteres)
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={modo === 'cancelar' ? 'ex.: compra devolvida ao fornecedor' : 'ex.: pagamento lançado na conta errada'}
              className={campo}
            />
          </label>
          <button
            disabled={pendente || texto.trim().length < 10}
            onClick={() => executar(() => (modo === 'cancelar' ? cancelarContaPagar(c.id, texto) : estornarContaPagar(c.id, texto)))}
            className={botao + ' bg-[#B00063] text-white'}
          >
            {pendente ? 'SALVANDO…' : modo === 'cancelar' ? 'CANCELAR CONTA' : 'ESTORNAR PAGAMENTO'}
          </button>
        </div>
      )}

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
    </div>
  )
}
