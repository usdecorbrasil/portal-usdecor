import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ETAPAS: Record<string, { label: string; cor: string }> = {
  recebido:      { label: 'Pedido recebido',   cor: 'bg-[#E6EDEE] text-[#0090D8]' },
  impressao:     { label: 'Impressão',         cor: 'bg-[#FBF0D9] text-[#C79600]' },
  estampando:    { label: 'Estampando',        cor: 'bg-[#FBF0D9] text-[#C79600]' },
  corte_costura: { label: 'Em corte / costura',cor: 'bg-[#FBF0D9] text-[#C79600]' },
  pronto:        { label: 'Pedido pronto',     cor: 'bg-[#FBF0D9] text-[#C79600]' },
  nf_emitida:    { label: 'Nota fiscal emitida', cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  expedido:      { label: 'Expedido',          cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  entregue:      { label: 'Entregue',          cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  fechado:       { label: 'Pedido fechado',    cor: 'bg-[#EAE9E3] text-[#6E6E68]' },
}

export default async function PedidosPage() {
  const supabase = await createClient()

  // As políticas do banco garantem que só vêm os pedidos deste cliente.
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, created_at, cancelado_em,
      pedido_status_historico(status, created_at)
    `)
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Meus pedidos
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        Acompanhe a produção em tempo real
      </p>

      <div className="space-y-3">
        {pedidos?.map((p) => {
          const hist = (p.pedido_status_historico ?? [])
            .slice()
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )

          const atual = hist[0]?.status ?? 'recebido'
          const etapa = ETAPAS[atual] ?? ETAPAS.recebido
          const cancelado = !!p.cancelado_em

          return (
            <Link
              key={p.id}
              href={`/pedidos/${p.id}`}
              className="block bg-white border border-[#DDDCD5] rounded-sm p-4 hover:border-[#131A2E]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono font-semibold">#{p.numero}</span>
                <span className="text-xs text-[#6E6E68]">
                  {new Date(p.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>

              <div className="flex items-end justify-between gap-3 mt-2">
                <span
                  className={`text-xs px-2 py-1 rounded-sm ${
                    cancelado ? 'bg-[#EAE9E3] text-[#6E6E68] line-through' : etapa.cor
                  }`}
                >
                  {cancelado ? 'Cancelado' : etapa.label}
                </span>
                <span className="font-mono font-semibold whitespace-nowrap">
                  R$ {brl(Number(p.total))}
                </span>
              </div>
            </Link>
          )
        })}

        {(!pedidos || pedidos.length === 0) && (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
            <p className="text-sm text-[#6E6E68]">
              Você ainda não fez nenhum pedido.
            </p>
            <Link
              href="/catalogo"
              className="inline-block mt-4 text-sm text-[#B00063] hover:underline"
            >
              Ir para o catálogo
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}