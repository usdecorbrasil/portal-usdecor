'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'

const m = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export type SaldoLinha = {
  clienteId: string
  cliente: string
  tecidoId: string
  tecido: string
  saldo: number
  ultimo: string | null
}

export type MovimentoLinha = {
  id: string
  tecidoId: string
  tipo: 'entrada' | 'consumo' | 'quebra' | 'ajuste'
  metros: number
  observacao: string | null
  autor: string | null
  pedidoId: string | null
  pedidoNumero: number | null
  data: string
}

const ROTULO_TIPO: Record<MovimentoLinha['tipo'], string> = {
  entrada: 'Entrada',
  consumo: 'Consumo',
  quebra: 'Quebra',
  ajuste: 'Ajuste',
}

const COR_TIPO: Record<MovimentoLinha['tipo'], string> = {
  entrada: 'bg-[#E3F0E8] text-[#2E7D4F]',
  consumo: 'bg-[#E6EDEE] text-[#0090D8]',
  quebra: 'bg-[#FBEAF0] text-[#B00063]',
  ajuste: 'bg-[#FBF0D9] text-[#8A6A00]',
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Saldo por cliente e tecido; com um cliente escolhido, o extrato embaixo. */
export default function Saldos({
  linhas,
  clientes,
  clienteFiltro,
  movimentos,
  nomeTecido,
}: {
  linhas: SaldoLinha[]
  clientes: { id: string; nome: string }[]
  clienteFiltro: string
  movimentos: MovimentoLinha[]
  nomeTecido: Record<string, string>
}) {
  const router = useRouter()

  function filtrar(id: string) {
    router.push(id ? `/admin/estoque?cliente=${id}` : '/admin/estoque')
  }

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] flex items-center gap-2 flex-1">
          SALDOS
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <select
          value={clienteFiltro}
          onChange={(e) => filtrar(e.target.value)}
          className="border border-[#DDDCD5] rounded-sm px-2.5 py-1.5 bg-white text-xs outline-none focus:border-[#131A2E]"
          aria-label="Filtrar por cliente"
        >
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {linhas.length === 0 ? (
        <div className={VAZIO} data-busca-vazio>
          Nenhum tecido em estoque{clienteFiltro ? ' para este cliente' : ''}. Lance uma entrada acima.
        </div>
      ) : (
        <div className={CAIXA} data-busca-grupo>
          <div className={CABECALHO}>
            <span className="flex-1 min-w-0">Cliente</span>
            <span className="w-32 sm:w-44 shrink-0">Tecido</span>
            <span className="w-24 shrink-0 text-right">Saldo</span>
            <span className="hidden sm:inline w-28 shrink-0 text-right">Último mov.</span>
          </div>
          <div className={CORPO}>
            {linhas.map((l) => (
              <Link
                key={l.clienteId + l.tecidoId}
                href={`/admin/estoque?cliente=${l.clienteId}`}
                data-busca={`${l.cliente} ${l.tecido}`}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white hover:bg-[#FAFAF8]"
              >
                <span
                  aria-hidden
                  className={'w-1 self-stretch -my-1.5 shrink-0 ' + (l.saldo <= 0 ? 'bg-[#B00063]' : l.saldo < 10 ? 'bg-[#C4A868]' : 'bg-[#8CB399]')}
                />
                <span className={NOME + ' flex-1 min-w-0'}>{l.cliente}</span>
                <span className="w-32 sm:w-44 shrink-0 text-xs text-[#6E6E68] truncate">{l.tecido}</span>
                <span className={NUM + ' w-24 shrink-0 text-right font-semibold ' + (l.saldo <= 0 ? 'text-[#B00063]' : 'text-[#131A2E]')}>
                  {m(l.saldo)} m
                </span>
                <span className={NUM + ' hidden sm:inline w-28 shrink-0 text-right text-[#9B9A93]'}>
                  {l.ultimo ? new Date(l.ultimo).toLocaleDateString('pt-BR') : '—'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {clienteFiltro && (
        <>
          <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
            EXTRATO
            <span className="flex-1 h-px bg-[#DDDCD5]" />
            <span className="font-mono normal-case tracking-normal text-[#9B9A93]">
              {movimentos.length}
            </span>
          </h2>

          {movimentos.length === 0 ? (
            <div className={VAZIO}>Nenhuma movimentação para este cliente.</div>
          ) : (
            <div className={CAIXA}>
              <div className={CORPO}>
                {movimentos.map((mv) => {
                  const sinal = mv.tipo === 'entrada' || (mv.tipo === 'ajuste' && mv.metros > 0) ? '+' : '−'
                  return (
                    <div key={mv.id} className="px-2.5 py-2 bg-white">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={ETIQUETA + ' ' + COR_TIPO[mv.tipo]}>{ROTULO_TIPO[mv.tipo]}</span>
                        <span className="text-sm font-semibold tracking-tight">
                          {nomeTecido[mv.tecidoId] ?? '—'}
                        </span>
                        {mv.pedidoId && (
                          <Link href={`/admin/pedidos/${mv.pedidoId}`} className="text-xs text-[#0090D8] hover:underline">
                            pedido #{mv.pedidoNumero}
                          </Link>
                        )}
                        <span className={NUM + ' ml-auto font-bold text-sm ' + (sinal === '+' ? 'text-[#2E7D4F]' : 'text-[#B00063]')}>
                          {sinal} {m(Math.abs(mv.metros))} m
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-[#9B9A93] mt-1 uppercase tracking-wider">
                        {dataHora(mv.data)}
                        {mv.autor && ` · por ${mv.autor}`}
                      </div>
                      {mv.observacao && (
                        <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">{mv.observacao}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
