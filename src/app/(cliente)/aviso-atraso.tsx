import Link from 'next/link'
import { situacaoAtraso } from '@/app/actions/pedidos'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function dataBr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

/**
 * Faixa fixa no topo de todas as páginas do cliente enquanto houver boleto
 * vencido e não pago. Some sozinha quando a baixa chega ou o dono libera.
 */
export default async function AvisoAtraso() {
  const { bloqueado, vencidos } = await situacaoAtraso()
  if (!bloqueado) return null

  return (
    <div className="bg-[#B00063] text-white">
      <div className="max-w-3xl mx-auto px-5 py-2.5 flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold tracking-tight">
            {vencidos.length === 1
              ? 'Há um boleto em atraso'
              : `Há ${vencidos.length} boletos em atraso`}
            {' '}— novos pedidos ficam bloqueados até a regularização.
          </p>
          <p className="text-xs text-white/85 mt-0.5 font-mono">
            {vencidos
              .slice(0, 3)
              .map((v) => `#${v.numero}${v.parcela ? ` (${v.parcela})` : ''} · R$ ${brl(v.valor)} · venceu ${dataBr(v.vencimento)}`)
              .join('   ')}
            {vencidos.length > 3 && `   e mais ${vencidos.length - 3}`}
          </p>
        </div>
        <Link
          href="/pedidos/boletos"
          className="shrink-0 bg-white text-[#B00063] rounded-sm px-3 py-1.5 text-xs font-bold tracking-wide hover:bg-[#FFF0F6]"
        >
          VER BOLETOS
        </Link>
      </div>
    </div>
  )
}
