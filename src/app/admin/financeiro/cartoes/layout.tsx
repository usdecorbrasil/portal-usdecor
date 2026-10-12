import Link from 'next/link'

/**
 * Cartões de crédito da empresa, em card próprio dentro do Financeiro (como
 * o Crédito dos clientes). O portão de acesso é o do layout do Financeiro.
 */
export default function CartoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-4 border-2 border-[#131A2E] rounded-sm bg-white">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#DDDCD5]">
        <h2 className="font-bold tracking-tight text-[#131A2E]">Cartões de crédito</h2>
        <Link href="/admin/financeiro/a-pagar" className="text-xs text-[#0090D8] hover:underline whitespace-nowrap">
          ← A pagar
        </Link>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}
