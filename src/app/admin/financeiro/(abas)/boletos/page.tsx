import { buscarAguardandoRecebimento } from '@/app/actions/clientes'
import FiltroStatus from './filtro-status'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function BoletosPage() {
  const parcelas = await buscarAguardandoRecebimento()
  const pendentes = parcelas.filter((p) => !p.pagoEm)
  const vencidas = parcelas.filter((p) => p.vencida)
  const valorTotal = pendentes.reduce((a, p) => a + p.valor, 0)
  const valorVencido = vencidas.reduce((a, p) => a + p.valor, 0)

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-6">
        {pendentes.length} cobrança{pendentes.length !== 1 ? 's' : ''} em
        aberto
        {pendentes.length > 0 && (
          <>
            {' · '}
            <span className="font-mono">R$ {brl(valorTotal)}</span> no total
          </>
        )}
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
        <FiltroStatus parcelas={parcelas} />
      )}
    </div>
  )
}