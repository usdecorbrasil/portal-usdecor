import { listarCartoes } from '@/app/actions/cartoes'
import { hojeBrasilia } from '@/lib/datas'
import ListaCartoes from './lista-cartoes'

/**
 * Financeiro → Cartões de crédito: nome, final, dia de fechamento e de
 * vencimento. Compra no crédito escolhe o cartão na conferência da nota, e
 * os vencimentos das parcelas seguem a fatura do cartão, não a data da nota.
 */
export default async function CartoesPage() {
  const cartoes = await listarCartoes()
  return (
    <div>
      <p className="text-sm text-[#6E6E68] leading-relaxed mb-4">
        Cada cartão tem o dia em que a fatura <strong>fecha</strong> e o dia em que ela <strong>vence</strong>.
        Compra feita até o fechamento entra na fatura do mês; depois dele, na do mês seguinte. Ao lançar uma
        nota paga no crédito, a equipe escolhe o cartão e as parcelas já vêm com o vencimento real da fatura.
      </p>
      <ListaCartoes cartoes={cartoes} hoje={hojeBrasilia()} />
    </div>
  )
}
