import Abas from '../abas'
import CardCredito from '../card-credito'

/**
 * As quatro abas do Financeiro (Boletos, Custos, Apuração, Relatórios) numa
 * caixa só. O Crédito fica fora dela, num card exclusivo logo abaixo — o
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
