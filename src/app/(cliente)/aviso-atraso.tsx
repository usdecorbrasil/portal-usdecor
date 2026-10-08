import Link from 'next/link'
import { situacaoAtraso } from '@/app/actions/pedidos'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function dataBr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

/**
 * Faixa fixa no topo de todas as páginas do cliente enquanto houver boleto
 * vencido e não pago. Dois tons:
 *   - amarelo: venceu há menos de 5 dias úteis — ainda dá para regularizar
 *     sem travar nada; mostra o prazo.
 *   - vermelho: passou de 5 dias úteis — os pedidos (novos e em andamento)
 *     não são atendidos até o pagamento.
 * Some sozinha quando a baixa chega ou o dono libera.
 */
export default async function AvisoAtraso() {
  const { bloqueado, vencidos, prazo } = await situacaoAtraso()
  if (vencidos.length === 0) return null

  const resumo = vencidos
    .slice(0, 3)
    .map((v) => `#${v.numero}${v.parcela ? ` (${v.parcela})` : ''} · R$ ${brl(v.valor)} · venceu ${dataBr(v.vencimento)}`)
    .join('   ')

  return (
    <div className={bloqueado ? 'bg-[#B00063] text-white' : 'bg-[#8A6A00] text-white'}>
      <div className="max-w-3xl mx-auto px-5 py-2.5 flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold tracking-tight">
            {vencidos.length === 1
              ? 'Há um boleto em atraso'
              : `Há ${vencidos.length} boletos em atraso`}
            {' — '}
            {bloqueado
              ? 'seus pedidos não serão atendidos até a regularização.'
              : prazo
              ? `regularize até ${dataBr(prazo)} para seus pedidos continuarem sendo atendidos.`
              : 'regularize para seus pedidos continuarem sendo atendidos.'}
          </p>
          <p className="text-xs text-white/85 mt-0.5 font-mono">
            {resumo}
            {vencidos.length > 3 && `   e mais ${vencidos.length - 3}`}
          </p>
        </div>
        <Link
          href="/pedidos/boletos"
          className={`shrink-0 bg-white rounded-sm px-3 py-1.5 text-xs font-bold tracking-wide ${
            bloqueado ? 'text-[#B00063] hover:bg-[#FFF0F6]' : 'text-[#8A6A00] hover:bg-[#FFFBEE]'
          }`}
        >
          VER BOLETOS
        </Link>
      </div>
    </div>
  )
}
