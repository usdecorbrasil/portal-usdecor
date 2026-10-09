import Link from 'next/link'
import { apurarPeriodo } from '@/app/actions/custos'
import FiltroData from '@/app/admin/pedidos/filtro-data'
import { hojeBrasilia } from '@/lib/datas'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function inicioDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function hoje() {
  return hojeBrasilia()
}

export default async function ApuracaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const { de, ate } = await searchParams
  const dataDe = de ?? inicioDoMes()
  const dataAte = ate ?? hoje()

  const linhas = await apurarPeriodo(dataDe, dataAte)

  const metragem = linhas.reduce((a, l) => a + l.metragem, 0)
  const receita = linhas.reduce((a, l) => a + l.receita, 0)
  const custo = linhas.reduce((a, l) => a + l.custo, 0)
  const lucro = receita - custo
  const margem = receita > 0 ? (lucro / receita) * 100 : 0

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-4 leading-relaxed">
        Pedidos estampados no período, confrontando o que foi cobrado com o
        custo de produção congelado em cada pedido.
      </p>

      <div className="mb-6">
        <FiltroData
          rota="/admin/financeiro/apuracao"
          deAtual={dataDe}
          ateAtual={dataAte}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao rotulo="METRAGEM" valor={`${brl(metragem)} m`} />
        <Cartao rotulo="RECEITA" valor={`R$ ${brl(receita)}`} />
        <Cartao rotulo="CUSTO" valor={`R$ ${brl(custo)}`} />
        <Cartao
          rotulo="LUCRO"
          valor={`R$ ${brl(lucro)}`}
          detalhe={receita > 0 ? `margem ${margem.toFixed(1)}%` : undefined}
          destaque={lucro >= 0 ? 'positivo' : 'negativo'}
        />
      </div>

      {linhas.length === 0 ? (
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-6">
          <p className="text-sm text-[#6E6E68]">
            Nenhum pedido estampado neste período.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {linhas.map((l) => (
            <Link
              key={l.pedidoId}
              href={`/admin/pedidos/${l.pedidoId}`}
              className="block bg-white border border-[#DDDCD5] rounded-sm p-3 sm:p-4 hover:border-[#131A2E]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-[#6E6E68]">
                    #{l.numero} ·{' '}
                    {new Date(l.data).toLocaleDateString('pt-BR')}
                  </div>
                  <span className="font-semibold tracking-tight text-sm sm:text-base truncate block">
                    {l.cliente}
                  </span>
                  <div className="text-xs text-[#6E6E68] font-mono mt-0.5">
                    {brl(l.metragem)} m
                  </div>
                </div>

                <div className="text-right shrink-0 text-xs font-mono">
                  <div className="text-[#6E6E68]">
                    receita R$ {brl(l.receita)}
                  </div>
                  <div className="text-[#6E6E68]">custo R$ {brl(l.custo)}</div>
                  <div
                    className={`font-bold text-sm mt-0.5 ${
                      l.lucro >= 0 ? 'text-[#2E7D4F]' : 'text-[#B00063]'
                    }`}
                  >
                    R$ {brl(l.lucro)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  destaque?: 'positivo' | 'negativo'
}) {
  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-3 sm:p-4">
      <div className="text-[9px] sm:text-[10px] tracking-[0.14em] text-[#6E6E68]">
        {rotulo}
      </div>
      <div
        className={`font-mono font-bold text-lg sm:text-xl mt-1 ${
          destaque === 'positivo'
            ? 'text-[#2E7D4F]'
            : destaque === 'negativo'
            ? 'text-[#B00063]'
            : 'text-[#131A2E]'
        }`}
      >
        {valor}
      </div>
      {detalhe && (
        <div className="text-[10px] text-[#6E6E68] mt-0.5">{detalhe}</div>
      )}
    </div>
  )
}
