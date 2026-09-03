'use client'

import { useState, useTransition } from 'react'
import { atualizarCustos } from '@/app/actions/custos'
import { custoTintaPorMetro, type Custos } from '@/lib/custos/calculo'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const paraNumero = (v: string) => Number(v.replace(',', '.'))
const paraTexto = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',')

export default function FormularioCustos({ custos }: { custos: Custos }) {
  const [papel, setPapel] = useState(paraTexto(custos.papelPorMetro))
  const [tinta, setTinta] = useState(paraTexto(custos.tintaPorLitro))
  const [consumo, setConsumo] = useState(paraTexto(custos.consumoMlPorMetro))
  const [aviso, setAviso] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciar] = useTransition()

  const papelNum = paraNumero(papel)
  const tintaNum = paraNumero(tinta)
  const consumoNum = paraNumero(consumo)
  const valido =
    !isNaN(papelNum) && !isNaN(tintaNum) && !isNaN(consumoNum) &&
    papelNum >= 0 && tintaNum >= 0 && consumoNum >= 0

  const tintaMetro = valido ? custoTintaPorMetro(tintaNum, consumoNum) : 0
  const totalMetro = valido ? papelNum + tintaMetro : 0

  function salvar() {
    if (!valido) return setAviso('Informe valores numéricos válidos.')
    setAviso('')
    setSalvo(false)

    iniciar(async () => {
      const r = await atualizarCustos({
        papelPorMetro: papelNum,
        tintaPorLitro: tintaNum,
        consumoMlPorMetro: consumoNum,
      })
      if (!r.ok) return setAviso(r.erro)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    })
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
        <h2 className="font-semibold tracking-tight text-sm mb-4">Papel</h2>

        <label
          htmlFor="papel"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          CUSTO POR METRO (R$)
        </label>
        <input
          id="papel"
          inputMode="decimal"
          value={papel}
          onChange={(e) => {
            setPapel(e.target.value)
            setAviso('')
          }}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm font-mono outline-none focus:border-[#131A2E]"
        />
      </div>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-3">
        <h2 className="font-semibold tracking-tight text-sm mb-4">Tinta</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="tinta"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              CUSTO POR LITRO (R$)
            </label>
            <input
              id="tinta"
              inputMode="decimal"
              value={tinta}
              onChange={(e) => {
                setTinta(e.target.value)
                setAviso('')
              }}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm font-mono outline-none focus:border-[#131A2E]"
            />
          </div>
          <div>
            <label
              htmlFor="consumo"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              CONSUMO (ML/M)
            </label>
            <input
              id="consumo"
              inputMode="decimal"
              value={consumo}
              onChange={(e) => {
                setConsumo(e.target.value)
                setAviso('')
              }}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm font-mono outline-none focus:border-[#131A2E]"
            />
          </div>
        </div>

        <p className="text-xs text-[#6E6E68] mt-2">
          Mililitros de tinta gastos por metro impresso.
        </p>
      </div>

      <div className="bg-white border-2 border-[#131A2E] rounded-sm p-4 mt-3">
        <h2 className="font-semibold tracking-tight text-sm">
          Custo por metro impresso
        </h2>

        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between items-baseline text-[#6E6E68]">
            <span>Papel</span>
            <span className="font-mono">R$ {brl(valido ? papelNum : 0)}</span>
          </div>
          <div className="flex justify-between items-baseline text-[#6E6E68]">
            <span>
              Tinta{' '}
              <span className="text-xs">
                ({valido ? paraTexto(consumoNum) : '0,00'} ml ×{' '}
                R$ {brl(valido ? tintaNum : 0)}/L)
              </span>
            </span>
            <span className="font-mono">R$ {brl(tintaMetro)}</span>
          </div>
        </div>

        <div className="flex justify-between items-baseline mt-3 pt-3 border-t-2 border-[#131A2E]">
          <span className="font-semibold tracking-tight">TOTAL</span>
          <strong className="font-mono text-2xl">R$ {brl(totalMetro)}</strong>
        </div>
      </div>

      {aviso && <p className="text-sm text-[#B00063] mt-3">{aviso}</p>}
      {salvo && (
        <p className="text-sm text-[#2E7D4F] mt-3">Custos atualizados.</p>
      )}

      <button
        onClick={salvar}
        disabled={pendente}
        className="w-full sm:w-auto mt-4 bg-[#131A2E] text-white rounded-sm px-6 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'SALVANDO...' : 'SALVAR CUSTOS'}
      </button>

      {custos.atualizadoEm && (
        <p className="text-xs text-[#6E6E68] mt-3">
          Última atualização em{' '}
          {new Date(custos.atualizadoEm).toLocaleDateString('pt-BR')}
        </p>
      )}
    </div>
  )
}
