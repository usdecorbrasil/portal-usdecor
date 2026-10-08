'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { atualizarCustos, atualizarConfigCustosAutomaticos } from '@/app/actions/custos'
import { custoTintaPorMetro, type Custos } from '@/lib/custos/calculo'
import type { SugestaoCustos } from '@/lib/custos/sugestao'
import type { ConfigCustosAutomaticos } from '@/lib/custos/compras'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const paraNumero = (v: string) => Number(v.replace(',', '.'))
const paraTexto = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',')

const JANELAS = [30, 60, 90] as const

export default function FormularioCustos({
  custos,
  sugestao,
  config,
}: {
  custos: Custos
  sugestao: SugestaoCustos | null
  config: ConfigCustosAutomaticos
}) {
  const [papel, setPapel] = useState(paraTexto(custos.papelPorMetro))
  const [tinta, setTinta] = useState(paraTexto(custos.tintaPorLitro))
  const [consumo, setConsumo] = useState(paraTexto(custos.consumoMlPorMetro))
  const [calandra, setCalandra] = useState(paraTexto(custos.calandraPorMetro))
  const [aviso, setAviso] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [auto, setAuto] = useState(config.ativo)
  const [avisoAuto, setAvisoAuto] = useState('')
  const [salvandoAuto, iniciarAuto] = useTransition()
  const [aplicada, setAplicada] = useState(false)

  const janela = sugestao?.janelaDias ?? config.janelaDias
  const temSugestao = !!(sugestao?.papel || sugestao?.tinta)

  function usarSugestao() {
    if (!sugestao) return
    if (sugestao.papel) setPapel(paraTexto(sugestao.papel.porMetroImpresso))
    if (sugestao.tinta) {
      setTinta(paraTexto(sugestao.tinta.custoMedioLitro))
      if (sugestao.tinta.consumoMlPorMetro != null)
        setConsumo(paraTexto(sugestao.tinta.consumoMlPorMetro))
    }
    setAviso('')
    setAplicada(true)
  }

  function salvarAuto(ativo: boolean) {
    setAvisoAuto('')
    iniciarAuto(async () => {
      const jd = (JANELAS as readonly number[]).includes(janela)
        ? (janela as 30 | 60 | 90)
        : 30
      const r = await atualizarConfigCustosAutomaticos({ ativo, janelaDias: jd })
      if (!r.ok) return setAvisoAuto(r.erro)
      setAuto(ativo)
      setAvisoAuto(
        ativo
          ? `Ligado: cada nota de compra com papel ou tinta recalcula os custos pela média dos últimos ${jd} dias.`
          : 'Desligado: os custos só mudam quando alguém salvar aqui.'
      )
    })
  }

  const papelNum = paraNumero(papel)
  const tintaNum = paraNumero(tinta)
  const consumoNum = paraNumero(consumo)
  const calandraNum = paraNumero(calandra)
  const valido =
    [papelNum, tintaNum, consumoNum, calandraNum].every(
      (v) => !isNaN(v) && v >= 0
    )

  const tintaMetro = valido ? custoTintaPorMetro(tintaNum, consumoNum) : 0
  const totalMetro = valido ? papelNum + tintaMetro + calandraNum : 0

  function salvar() {
    if (!valido) return setAviso('Informe valores numéricos válidos.')
    setAviso('')
    setSalvo(false)

    iniciar(async () => {
      const r = await atualizarCustos({
        papelPorMetro: papelNum,
        tintaPorLitro: tintaNum,
        consumoMlPorMetro: consumoNum,
        calandraPorMetro: calandraNum,
      })
      if (!r.ok) return setAviso(r.erro)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    })
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold tracking-tight text-sm">
            Custos pelas compras
          </h2>
          <div className="flex gap-1">
            {JANELAS.map((j) => (
              <Link
                key={j}
                href={`?janela=${j}`}
                scroll={false}
                className={
                  'text-xs px-2 py-1 rounded-sm border ' +
                  (j === janela
                    ? 'bg-[#131A2E] text-white border-[#131A2E]'
                    : 'border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E]')
                }
              >
                {j} dias
              </Link>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
          Média ponderada das notas de compra lançadas em Estoque → Despesas,
          com o item ligado a um suprimento de papel ou tinta.
        </p>

        {!temSugestao && (
          <p className="text-sm text-[#6E6E68] mt-3">
            Nenhuma compra de papel (em metros) ou tinta (em L ou mL) nos
            últimos {janela} dias.
          </p>
        )}

        {sugestao?.papel && (
          <div className="mt-3 text-sm">
            <div className="flex justify-between items-baseline gap-2">
              <span className="font-semibold">Papel</span>
              <span className="font-mono">
                R$ {brl(sugestao.papel.porMetroImpresso)}/m impresso
              </span>
            </div>
            <p className="text-xs text-[#6E6E68] mt-0.5">
              R$ {paraTexto(sugestao.papel.custoMedioMetro, 4)} por metro
              comprado × {paraTexto(sugestao.papel.consumoPorMetro, 2)} m por
              metro estampado · {sugestao.papel.compras} compra
              {sugestao.papel.compras > 1 ? 's' : ''},{' '}
              {sugestao.papel.metrosComprados.toLocaleString('pt-BR')} m
            </p>
            {sugestao.papel.avisos.map((a) => (
              <p key={a} className="text-xs text-[#8A6100] mt-1">
                {a}
              </p>
            ))}
          </div>
        )}

        {sugestao?.tinta && (
          <div className="mt-3 text-sm">
            <div className="flex justify-between items-baseline gap-2">
              <span className="font-semibold">Tinta</span>
              <span className="font-mono">
                R$ {brl(sugestao.tinta.custoMedioLitro)}/L
              </span>
            </div>
            <p className="text-xs text-[#6E6E68] mt-0.5">
              {sugestao.tinta.compras} compra
              {sugestao.tinta.compras > 1 ? 's' : ''},{' '}
              {sugestao.tinta.litrosComprados.toLocaleString('pt-BR')} L ·
              coeficiente{' '}
              {sugestao.tinta.consumoMlPorMetro != null
                ? `${paraTexto(sugestao.tinta.consumoMlPorMetro)} mL/m (soma das tintas cadastradas)`
                : 'não definido — informe o consumo por metro de cada tinta em Estoque → Suprimentos'}
            </p>
            {sugestao.tinta.avisos.map((a) => (
              <p key={a} className="text-xs text-[#8A6100] mt-1">
                {a}
              </p>
            ))}
          </div>
        )}

        {temSugestao && (
          <button
            type="button"
            onClick={usarSugestao}
            className="mt-3 border border-[#131A2E] rounded-sm px-4 py-2 text-xs font-semibold tracking-wide hover:bg-[#FAFAF7]"
          >
            USAR ESTES VALORES
          </button>
        )}
        {aplicada && (
          <p className="text-xs text-[#6E6E68] mt-2">
            Valores preenchidos abaixo. Confira e clique em Salvar custos. A
            calandra não muda.
          </p>
        )}

        <label className="flex items-start gap-2 mt-4 pt-3 border-t border-[#DDDCD5] text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={auto}
            disabled={salvandoAuto}
            onChange={(e) => salvarAuto(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Atualizar sozinho a cada nota de compra
            <span className="block text-xs text-[#6E6E68]">
              Ao salvar uma nota com papel ou tinta, papel e tinta passam a
              ser a média dos últimos {janela} dias. Calandra nunca muda
              sozinha, e o coeficiente da tinta só muda se estiver
              cadastrado.
            </span>
          </span>
        </label>
        {avisoAuto && (
          <p className="text-xs text-[#6E6E68] mt-2">{avisoAuto}</p>
        )}
      </div>

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

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-3">
        <h2 className="font-semibold tracking-tight text-sm mb-4">
          Calandra
        </h2>

        <label
          htmlFor="calandra"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          CUSTO POR METRO (R$)
        </label>
        <input
          id="calandra"
          inputMode="decimal"
          value={calandra}
          onChange={(e) => {
            setCalandra(e.target.value)
            setAviso('')
          }}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm font-mono outline-none focus:border-[#131A2E]"
        />
        <p className="text-xs text-[#6E6E68] mt-2">
          Energia, manutenção e mão de obra da calandra por metro.
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
          <div className="flex justify-between items-baseline text-[#6E6E68]">
            <span>Calandra</span>
            <span className="font-mono">
              R$ {brl(valido ? calandraNum : 0)}
            </span>
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
