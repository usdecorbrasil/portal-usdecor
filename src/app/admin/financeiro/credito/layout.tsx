import Link from 'next/link'

/**
 * Área de Crédito dentro do Financeiro, no seu próprio card (fora da caixa
 * de abas). O portão de acesso é o do layout do Financeiro.
 */
export default function CreditoLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-4 border-2 border-[#131A2E] rounded-sm bg-white">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#DDDCD5]">
        <h2 className="font-bold tracking-tight text-[#131A2E]">Crédito dos clientes</h2>
        <Link
          href="/admin/financeiro/a-receber"
          className="text-xs text-[#0090D8] hover:underline whitespace-nowrap"
        >
          ← Financeiro
        </Link>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}
