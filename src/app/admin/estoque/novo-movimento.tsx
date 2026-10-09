'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarMovimento } from '@/app/actions/estoque'
import type { TipoMovimento } from '@/lib/estoque/tipos'
import { paraNumeroBr } from '@/lib/numero'

const TIPOS: { chave: TipoMovimento; rotulo: string; dica: string }[] = [
  { chave: 'entrada', rotulo: 'Entrada', dica: 'Tecido que chegou do cliente, já conferido' },
  { chave: 'quebra', rotulo: 'Quebra', dica: 'Perda na produção' },
  { chave: 'ajuste', rotulo: 'Ajuste', dica: 'Acerto de inventário — use sinal negativo para tirar' },
  { chave: 'consumo', rotulo: 'Consumo', dica: 'Metragem estampada (normalmente lançada pelo pedido)' },
]

/** Lançamento manual de movimento. O saldo é só a soma: nada se edita direto. */
export default function NovoMovimento({
  clientes,
  tecidos,
  clienteInicial,
}: {
  clientes: { id: string; nome: string }[]
  tecidos: { id: string; nome: string }[]
  clienteInicial: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState(clienteInicial)
  const [tecidoId, setTecidoId] = useState(tecidos[0]?.id ?? '')
  const [tipo, setTipo] = useState<TipoMovimento>('entrada')
  const [metros, setMetros] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')
  const [pendente, iniciar] = useTransition()

  function salvar() {
    setErro('')
    setFeito('')
    const n = paraNumeroBr(metros)
    if (!clienteId) return setErro('Escolha o cliente.')
    if (!tecidoId) return setErro('Escolha o tecido.')
    if (!Number.isFinite(n) || (tipo === 'ajuste' ? n === 0 : n <= 0)) {
      return setErro('Informe a metragem.')
    }
    iniciar(async () => {
      const r = await registrarMovimento({
        clienteId,
        tecidoId,
        tipo,
        metros: n,
        observacao: observacao.trim() || undefined,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setMetros('')
      setObservacao('')
      setFeito('Movimento lançado.')
      router.push(`/admin/estoque?cliente=${clienteId}`)
      router.refresh()
    })
  }

  if (tecidos.length === 0) {
    return (
      <p className="text-xs text-[#8A6A00] bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm px-4 py-3">
        Cadastre ao menos um tecido (no fim da página) para começar a lançar movimentos.
      </p>
    )
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="bg-[#131A2E] text-white rounded-sm px-4 py-2.5 text-xs font-semibold tracking-wide"
      >
        + LANÇAR MOVIMENTO
      </button>
    )
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">Novo movimento</p>
        <button onClick={() => setAberto(false)} className="text-xs text-[#6E6E68] hover:text-[#131A2E]">
          fechar
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">CLIENTE</label>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]"
          >
            <option value="">—</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">TECIDO</label>
          <select
            value={tecidoId}
            onChange={(e) => setTecidoId(e.target.value)}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]"
          >
            {tecidos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {TIPOS.map((t) => (
          <button
            key={t.chave}
            type="button"
            onClick={() => setTipo(t.chave)}
            title={t.dica}
            className={`border rounded-sm px-3 py-2 text-sm font-semibold ${
              tipo === t.chave ? 'border-[#131A2E] bg-[#131A2E] text-white' : 'border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E]'
            }`}
          >
            {t.rotulo}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[#6E6E68] mt-1.5">{TIPOS.find((t) => t.chave === tipo)?.dica}</p>

      <div className="grid sm:grid-cols-[10rem_1fr] gap-3 mt-3">
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">METROS</label>
          <input
            type="text"
            inputMode="decimal"
            value={metros}
            onChange={(e) => setMetros(e.target.value)}
            placeholder={tipo === 'ajuste' ? '-12,5 ou 8' : '120,50'}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 font-mono text-sm outline-none focus:border-[#131A2E]"
          />
        </div>
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">OBSERVAÇÃO (OPCIONAL)</label>
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={500}
            placeholder="Ex.: NF 1234, 3 rolos; conferido por João"
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
          />
        </div>
      </div>

      {erro && <p className="text-xs text-[#B00063] mt-3">{erro}</p>}
      {feito && <p className="text-xs text-[#2E7D4F] mt-3">{feito}</p>}

      <button
        onClick={salvar}
        disabled={pendente}
        className="mt-3 bg-[#B00063] text-white rounded-sm px-4 py-2.5 text-xs font-bold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'LANÇANDO…' : 'LANÇAR'}
      </button>
    </div>
  )
}
