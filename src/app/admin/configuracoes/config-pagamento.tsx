'use client'

import { useState, useTransition } from 'react'
import { atualizarConfigPagamento } from '@/app/actions/configuracoes'
import {
  FORMAS,
  ROTULOS_FORMA,
  calcularTaxa,
  totalComTaxa,
  type ConfigForma,
  type ConfigPagamento,
  type Forma,
} from '@/lib/pagamento/config'
import { paraNumeroBr } from '@/lib/numero'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Pedido de exemplo da prévia, só para o dono enxergar o efeito da taxa. */
const EXEMPLO = 1000

export default function ConfigPagamento({
  configAtual,
}: {
  configAtual: ConfigPagamento
}) {
  const [aberto, setAberto] = useState(false)
  const [config, setConfig] = useState<ConfigPagamento>(configAtual)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [pendente, iniciar] = useTransition()

  const mudou = JSON.stringify(config) !== JSON.stringify(configAtual)

  const ativas = FORMAS.filter((f) => configAtual[f].ativa)

  const resumo =
    ativas.length === 0
      ? 'Nenhuma forma ativa'
      : ativas
          .map((f) => {
            const c = configAtual[f]
            const vezes = c.maxParcelas > 1 ? ` até ${c.maxParcelas}x` : ''
            const taxa =
              c.percentual > 0 || c.taxaFixa > 0
                ? ` (${[
                    c.percentual > 0 ? `+${c.percentual}%` : '',
                    c.taxaFixa > 0 ? `+R$ ${brl(c.taxaFixa)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')})`
                : ''
            return ROTULOS_FORMA[f] + vezes + taxa
          })
          .join(' · ')

  function alterar(forma: Forma, campo: keyof ConfigForma, valor: number | boolean) {
    setSucesso(false)
    setConfig((atual) => ({
      ...atual,
      [forma]: { ...atual[forma], [campo]: valor },
    }))
  }

  function salvar() {
    setErro('')
    setSucesso(false)
    iniciar(async () => {
      const r = await atualizarConfigPagamento(config)
      if (r.ok) setSucesso(true)
      else setErro(r.erro)
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-semibold tracking-tight text-sm">
            Formas de pagamento
          </span>
          {/* Fechado, o resumo já responde a pergunta mais comum */}
          <span className="block text-xs text-[#6E6E68] mt-1 leading-relaxed">
            {aberto
              ? 'O que a equipe pode escolher ao faturar, em quantas vezes, e quanto a forma escolhida acrescenta ao pedido. A taxa entra como acréscimo no valor cobrado — não altera o preço por metro.'
              : resumo}
          </span>
        </span>
        <span
          aria-hidden
          className={`text-[#6E6E68] text-xs shrink-0 mt-0.5 transition-transform ${
            aberto ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>

      {aberto && (
      <>
      <div className="mt-4 space-y-3">
        {FORMAS.map((forma) => (
          <BlocoForma
            key={forma}
            forma={forma}
            config={config[forma]}
            aoAlterar={(campo, valor) => alterar(forma, campo, valor)}
          />
        ))}
      </div>

      {erro && (
        <p className="text-sm text-[#B00063] mt-3 border border-[#B00063] rounded-sm p-2.5">
          {erro}
        </p>
      )}

      {sucesso && !mudou && (
        <p className="text-xs text-[#2E7D4F] mt-3">Formas de pagamento salvas.</p>
      )}

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#EFEEE8]">
        <button
          onClick={salvar}
          disabled={pendente || !mudou}
          className="bg-[#131A2E] text-white rounded-sm px-4 py-2 text-xs font-semibold tracking-wide disabled:opacity-40"
        >
          {pendente ? 'SALVANDO...' : 'SALVAR'}
        </button>
        {mudou && !pendente && (
          <button
            onClick={() => {
              setConfig(configAtual)
              setErro('')
            }}
            className="text-xs text-[#6E6E68] hover:text-[#131A2E]"
          >
            descartar alterações
          </button>
        )}
      </div>
      </>
      )}
    </div>
  )
}

function BlocoForma({
  forma,
  config,
  aoAlterar,
}: {
  forma: Forma
  config: ConfigForma
  aoAlterar: (campo: keyof ConfigForma, valor: number | boolean) => void
}) {
  const ehBoleto = forma === 'boleto'
  // Pix e débito são à vista: sem parcelas, sem mínimo por parcela
  const ehDebito = forma === 'cartao_debito' || forma === 'pix'

  // Prévia: sempre no maior parcelamento permitido, que é o pior caso
  const parcelas = Math.max(1, config.maxParcelas)
  const taxa = calcularTaxa(EXEMPLO, config, parcelas, forma)
  const total = totalComTaxa(EXEMPLO, config, parcelas, forma)

  return (
    <div
      className={
        'border rounded-sm ' +
        (config.ativa ? 'border-[#DDDCD5] bg-white' : 'border-[#EFEEE8] bg-[#FAFAF8]')
      }
    >
      <label className="flex items-center gap-2 px-3 py-2 border-b border-[#EFEEE8] cursor-pointer">
        <input
          type="checkbox"
          checked={config.ativa}
          onChange={(e) => aoAlterar('ativa', e.target.checked)}
          className="w-4 h-4 accent-[#131A2E]"
        />
        <span className="font-semibold tracking-tight text-sm flex-1">
          {ROTULOS_FORMA[forma]}
        </span>
        {!config.ativa && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-[#9B9A93]">
            desligada
          </span>
        )}
      </label>

      {config.ativa && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3">
            {!ehDebito && (
              <Campo
                rotulo="Máx. parcelas"
                sufixo="x"
                valor={config.maxParcelas}
                inteiro
                onChange={(n) => aoAlterar('maxParcelas', n)}
              />
            )}

            {!ehDebito && (
              <Campo
                rotulo="Mín. por parcela"
                prefixo="R$"
                valor={config.valorMinimoParcela}
                onChange={(n) => aoAlterar('valorMinimoParcela', n)}
              />
            )}

            {ehBoleto && (
              <div>
                <label
                  htmlFor={`intervalo-${forma}`}
                  className="block text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] mb-1"
                >
                  Intervalo
                </label>
                <select
                  id={`intervalo-${forma}`}
                  value={config.intervaloDias}
                  onChange={(e) => aoAlterar('intervaloDias', Number(e.target.value))}
                  className="w-full border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm bg-white outline-none focus:border-[#131A2E]"
                >
                  <option value={15}>15 dias</option>
                  <option value={30}>30 dias</option>
                </select>
              </div>
            )}

            <Campo
              rotulo="Juros / taxa"
              sufixo="%"
              valor={config.percentual}
              onChange={(n) => aoAlterar('percentual', n)}
            />

            <Campo
              rotulo={ehBoleto ? 'Taxa por boleto' : 'Taxa por transação'}
              prefixo="R$"
              valor={config.taxaFixa}
              onChange={(n) => aoAlterar('taxaFixa', n)}
            />
          </div>

          <p className="text-[11px] text-[#6E6E68] border-t border-[#EFEEE8] px-3 py-2 leading-relaxed">
            Num pedido de{' '}
            <strong className="font-mono">R$ {brl(EXEMPLO)}</strong>
            {parcelas > 1 ? ` em ${parcelas}x` : ' à vista'}: cliente paga{' '}
            <strong className="font-mono text-[#131A2E]">R$ {brl(total)}</strong>
            {taxa > 0 ? (
              <>
                {' '}
                (<span className="font-mono">R$ {brl(taxa)}</span> de acréscimo
                {parcelas > 1 && (
                  <>
                    , parcelas de{' '}
                    <span className="font-mono">R$ {brl(total / parcelas)}</span>
                  </>
                )}
                )
              </>
            ) : (
              ' — sem acréscimo'
            )}
            {ehBoleto && config.taxaFixa > 0 && parcelas > 1 && (
              <span className="block mt-1 text-[#9B9A93]">
                A taxa fixa do boleto é por documento, então multiplica pelo
                número de parcelas.
              </span>
            )}
          </p>
        </>
      )}
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  onChange,
  prefixo,
  sufixo,
  inteiro = false,
}: {
  rotulo: string
  valor: number
  onChange: (n: number) => void
  prefixo?: string
  sufixo?: string
  inteiro?: boolean
}) {
  // Texto local para não atrapalhar a digitação de "1," ou campo vazio
  const [texto, setTexto] = useState(String(valor))

  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] mb-1">
        {rotulo}
      </label>
      <div className="flex items-center border border-[#DDDCD5] rounded-sm bg-white focus-within:border-[#131A2E]">
        {prefixo && (
          <span className="pl-2 text-[10px] font-mono text-[#9B9A93]">
            {prefixo}
          </span>
        )}
        <input
          value={texto}
          inputMode="decimal"
          onChange={(e) => {
            setTexto(e.target.value)
            const n = inteiro
              ? parseInt(e.target.value, 10)
              : paraNumeroBr(e.target.value)
            if (Number.isFinite(n) && n >= 0) onChange(n)
          }}
          onBlur={() => setTexto(String(valor))}
          className="w-full px-2 py-1.5 text-sm font-mono tabular-nums outline-none min-w-0"
        />
        {sufixo && (
          <span className="pr-2 text-[10px] font-mono text-[#9B9A93]">
            {sufixo}
          </span>
        )}
      </div>
    </div>
  )
}
