import Abas from '../abas'
import CardCredito from '../card-credito'
import CardFluxo from '../card-fluxo'

/**
 * No topo, o totalizador de contas a receber e a pagar (pedido do dono,
 * 12/10/2026). Depois, as abas do Financeiro em dois cards: Contas (A receber, A pagar) e Custos,
 * Apuração e Relatórios. O Crédito fica fora dela, num card exclusivo logo abaixo — o
 * dono pediu (08/10/2026) que não se misturasse com as demais.
 */
export default function AbasFinanceiroLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CardFluxo />
      <Abas>{children}</Abas>
      <CardCredito />
    </>
  )
}
