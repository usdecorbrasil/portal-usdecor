import Link from 'next/link'
import { listarExtratos } from '@/app/actions/conciliacao'
import { listarCartoes } from '@/app/actions/cartoes'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'
import ImportarExtrato from './importar-extrato'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')

/**
 * Financeiro → Conciliação: extratos bancários e faturas de cartão
 * importados, com quanto já foi conferido em cada um. Pedido do dono
 * (12/10/2026): provar que tudo o que passou na conta e no cartão está
 * lançado em A pagar / A receber.
 */
export default async function ConciliacaoPage() {
  const [extratos, cartoes] = await Promise.all([listarExtratos(), listarCartoes(true)])
  const ia = !!process.env.ANTHROPIC_API_KEY

  return (
    <div>
      <p className="text-sm text-[#6E6E68] leading-relaxed mb-4">
        Importe o extrato da conta ou a fatura do cartão. O portal procura cada lançamento em A pagar
        (saídas) e nas cobranças dos pedidos (entradas) e sugere o vínculo; você confirma, dá baixa se
        ainda estiver em aberto, ignora o que não entra (tarifa, transferência entre contas) e fecha o
        extrato quando não sobra nada pendente.
      </p>

      <ImportarExtrato cartoes={cartoes.map((c) => ({ id: c.id, nome: c.final ? `${c.nome} · ${c.final}` : c.nome }))} ia={ia} />

      {extratos.length === 0 ? (
        <div className={VAZIO + ' mt-4'}>Nenhum extrato importado ainda.</div>
      ) : (
        <div className={CAIXA + ' mt-4'}>
          <div className={CABECALHO + ' hidden sm:flex'}>
            <span className="w-24">Período</span>
            <span className="flex-1">Extrato</span>
            <span className="w-24 text-right">Entradas</span>
            <span className="w-24 text-right">Saídas</span>
            <span className="w-28 text-right">Conferido</span>
          </div>
          <div className={CORPO}>
            {extratos.map((e) => {
              const feito = e.conciliados + e.ignorados
              return (
                <Link key={e.id} href={`/admin/financeiro/conciliacao/${e.id}`} data-busca className="relative flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 px-2.5 py-1.5 bg-white hover:bg-[#FAFAF8]">
                  <span className={'absolute left-0 top-0 bottom-0 w-px ' + (e.fechadoEm ? 'bg-[#8CB399]' : e.pendentes ? 'bg-[#C4A868]' : 'bg-[#131A2E]')} />
                  <span className={NUM + ' sm:w-24 text-[#6E6E68]'}>{dataBr(e.periodoInicio)} – {dataBr(e.periodoFim)}</span>
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className={NOME}>{e.tipo === 'cartao' ? `Fatura · ${e.cartao ?? 'cartão'}` : `Conta · ${e.origem ?? 'banco'}`}</span>
                    <span className={ETIQUETA + ' bg-[#F2F1ED] text-[#6E6E68]'}>{e.modo === 'ofx' ? 'OFX' : 'IA'}</span>
                    {e.fechadoEm ? <span className={ETIQUETA + ' bg-[#E6F2EA] text-[#2E7D4F]'}>fechado</span> : e.pendentes ? <span className={ETIQUETA + ' bg-[#FFFBEE] text-[#8A6100]'}>{e.pendentes} pendente{e.pendentes > 1 ? 's' : ''}</span> : <span className={ETIQUETA + ' bg-[#E6EDEE] text-[#0090D8]'}>pronto para fechar</span>}
                  </span>
                  <span className="flex items-center gap-2 sm:contents text-[11px] text-[#6E6E68]">
                    <span className={NUM + ' sm:w-24 sm:text-right text-[#2E7D4F]'}>+ {brl(e.entradas)}</span>
                    <span className={NUM + ' sm:w-24 sm:text-right text-[#B00063]'}>− {brl(e.saidas)}</span>
                    <span className={NUM + ' sm:w-28 sm:text-right'}>{feito}/{e.total}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
