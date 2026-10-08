import Link from 'next/link'
import { listarContasPagar, type FiltroContas } from '@/app/actions/contas-pagar'
import { createClient } from '@/lib/supabase/server'
import ListaContas from './lista-contas'
import NovaConta from './nova-conta'

/**
 * Contas a pagar. Nascem das notas lançadas em Estoque → Despesas (a forma de
 * pagamento da nota define se já entram pagas ou com vencimentos) ou são
 * lançadas aqui, à mão, para o que não tem nota (aluguel, energia).
 */

const SITUACOES: { chave: FiltroContas['situacao']; rotulo: string }[] = [
  { chave: 'abertas', rotulo: 'Em aberto' },
  { chave: 'pagas', rotulo: 'Pagas' },
  { chave: 'canceladas', rotulo: 'Canceladas' },
  { chave: 'todas', rotulo: 'Todas' },
]

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataValida = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

export default async function APagarPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; de?: string; ate?: string; nova?: string }>
}) {
  const sp = await searchParams
  const situacao = (SITUACOES.find((s) => s.chave === sp.situacao)?.chave ?? 'abertas') as FiltroContas['situacao']
  const filtro: FiltroContas = { situacao, de: dataValida(sp.de), ate: dataValida(sp.ate) }

  const supabase = await createClient()
  const [r, { data: categorias }] = await Promise.all([
    listarContasPagar(filtro),
    supabase.from('categorias_despesa').select('id, nome').eq('ativo', true).order('nome'),
  ])
  if (!r) return null
  const { contas, resumo, hoje } = r

  const quadros = [
    { rotulo: 'VENCIDAS', v: resumo.vencidas, cor: resumo.vencidas.qtd ? 'text-[#B00063]' : 'text-[#131A2E]' },
    { rotulo: 'PRÓXIMOS 7 DIAS', v: resumo.proximos7, cor: 'text-[#131A2E]' },
    { rotulo: 'ATÉ O FIM DO MÊS', v: resumo.restoDoMes, cor: 'text-[#131A2E]' },
    { rotulo: 'PAGO NO MÊS', v: resumo.pagoNoMes, cor: 'text-[#2E7D4F]' },
  ]

  const href = (s: string) => {
    const q = new URLSearchParams({ situacao: s })
    if (filtro.de) q.set('de', filtro.de)
    if (filtro.ate) q.set('ate', filtro.ate)
    return `?${q.toString()}`
  }

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-4 leading-relaxed">
        Contas geradas pelas notas lançadas em Estoque → Despesas e as lançadas aqui. Nota paga na
        hora (dinheiro, Pix, débito) entra já quitada.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {quadros.map((q) => (
          <div key={q.rotulo} className="bg-white border border-[#DDDCD5] rounded-sm px-3 py-2">
            <p className="text-[9px] font-mono tracking-wider text-[#9B9A93]">{q.rotulo}</p>
            <p className={'font-mono font-semibold text-base sm:text-lg ' + q.cor}>R$ {brl(q.v.valor)}</p>
            <p className="text-[11px] text-[#6E6E68]">
              {q.v.qtd} conta{q.v.qtd !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-wrap gap-1">
          {SITUACOES.map((s) => (
            <Link
              key={s.chave}
              href={href(s.chave)}
              className={
                'text-xs px-2.5 py-1.5 rounded-sm border ' +
                (s.chave === situacao
                  ? 'bg-[#131A2E] text-white border-[#131A2E]'
                  : 'bg-white border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E]')
              }
            >
              {s.rotulo}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2" action="">
          <input type="hidden" name="situacao" value={situacao} />
          <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
            {situacao === 'pagas' ? 'PAGAS DE' : 'VENCE DE'}
            <input type="date" name="de" defaultValue={filtro.de} className="block border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs bg-white" />
          </label>
          <label className="text-[10px] font-mono tracking-wider text-[#6E6E68]">
            ATÉ
            <input type="date" name="ate" defaultValue={filtro.ate} className="block border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs bg-white" />
          </label>
          <button className="text-xs px-3 py-1.5 rounded-sm border border-[#131A2E] bg-white">Filtrar</button>
          {(filtro.de || filtro.ate) && (
            <Link href={`?situacao=${situacao}`} className="text-xs text-[#6E6E68] underline pb-1.5">
              limpar datas
            </Link>
          )}
        </form>
      </div>

      <NovaConta
        categorias={(categorias ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }))}
        hoje={hoje}
        abrir={sp.nova === '1'}
      />

      <ListaContas contas={contas} situacao={situacao} hoje={hoje} />
    </div>
  )
}
