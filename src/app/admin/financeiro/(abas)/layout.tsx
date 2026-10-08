import Abas from '../abas'
import CardCredito from '../card-credito'

/**
 * As abas do Financeiro em dois cards: Contas (A receber, A pagar) e Custos,
 * Apuração e Relatórios. O Crédito fica fora dela, num card exclusivo logo abaixo — o
 * dono pediu (08/10/2026) que não se misturasse com as demais.
 */
export default function AbasFinanceiroLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Abas>{children}</Abas>
      <CardCredito />
    </>
  )
}
