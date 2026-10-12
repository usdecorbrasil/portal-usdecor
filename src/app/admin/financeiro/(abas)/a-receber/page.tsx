import { buscarAguardandoRecebimento } from '@/app/actions/clientes'
import { hojeBrasilia } from '@/lib/datas'
import { createClient } from '@/lib/supabase/server'
import ListaReceber from './lista-receber'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function AReceberPage() {
  const parcelas = await buscarAguardandoRecebimento()
  // Cobranças conferidas no extrato (conciliação): etiqueta e link
  const supabase = await createClient()
  const { data: conc } = await supabase.from('extrato_lancamentos').select('pedido_id, numero_parcela, extrato_id, data').eq('situacao', 'conciliado').not('pedido_id', 'is', null).limit(5000)
  const conferidas = new Map(((conc ?? []) as { pedido_id: string; numero_parcela: number | null; extrato_id: string; data: string }[]).map((l) => [`${l.pedido_id}:${l.numero_parcela ?? 0}`, { extratoId: l.extrato_id, data: l.data }]))
  const pendentes = parcelas.filter((p) => !p.pagoEm)
  const vencidas = parcelas.filter((p) => p.vencida)
  const valorTotal = pendentes.reduce((a, p) => a + p.valor, 0)
  const valorVencido = vencidas.reduce((a, p) => a + p.valor, 0)

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-2">
        {pendentes.length} cobrança{pendentes.length !== 1 ? 's' : ''} em
        aberto
        {pendentes.length > 0 && (
          <>
            {' · '}
            <span className="font-mono">R$ {brl(valorTotal)}</span> no total
          </>
        )}
      </p>
      <p className="text-xs text-[#6E6E68] mb-6">
        Marque as cobranças que já conferiu e confirme o recebimento, ou abra uma delas e confirme ali. A baixa pelo Bling continua acontecendo sozinha.
      </p>

      {vencidas.length > 0 && (
        <div className="bg-[#FBEAF0] border-l-4 border-[#B00063] rounded-r-sm p-4 mb-6">
          <p className="font-semibold tracking-tight text-sm text-[#B00063]">
            {vencidas.length} parcela{vencidas.length !== 1 ? 's' : ''} vencida
            {vencidas.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-[#6E6E68] mt-1">
            <span className="font-mono font-semibold text-[#B00063]">
              R$ {brl(valorVencido)}
            </span>{' '}
            em atraso
          </p>
        </div>
      )}

      {parcelas.length === 0 ? (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
          <p className="text-sm text-[#6E6E68]">
            Nenhuma cobrança em aberto.
          </p>
        </div>
      ) : (
        <ListaReceber parcelas={parcelas} hoje={hojeBrasilia()} conferidas={Object.fromEntries(conferidas)} />
      )}
    </div>
  )
}