import Abas from '../abas'
import CardFluxo from '../card-fluxo'

/**
 * No topo, o totalizador de contas a pagar. Depois, as abas do Financeiro.
 * A receber e o resultado por canal voltam com o módulo de pedidos e
 * repasses dos marketplaces.
 */
export default function AbasFinanceiroLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CardFluxo />
      <Abas>{children}</Abas>
    </>
  )
}
