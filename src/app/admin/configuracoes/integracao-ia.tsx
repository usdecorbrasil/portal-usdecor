'use client'

import { useState, useTransition } from 'react'
import { testarLeituraIa } from '@/app/actions/leitura-ia'

/**
 * Leitura de notas por IA: mostra se a chave existe na Vercel, testa se ela
 * funciona e diz o que fazer quando falta. Sem a chave, Nova nota só aceita
 * digitação.
 */
export default function IntegracaoIa({ configurada }: { configurada: boolean }) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()

  function testar() {
    setResultado(null)
    iniciar(async () => {
      const r = await testarLeituraIa()
      setResultado(r.ok ? { ok: true, texto: r.detalhe } : { ok: false, texto: r.erro })
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold tracking-tight text-sm">Leitura de notas por IA</h3>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm ${
            configurada ? 'bg-[#E3F0E8] text-[#2E7D4F]' : 'bg-[#FBF0D9] text-[#C79600]'
          }`}
        >
          {configurada ? 'configurada' : 'falta a chave'}
        </span>
      </div>
      <p className="text-xs text-[#6E6E68] mt-1">
        Lê a foto ou o PDF da nota de compra e preenche a conferência em Estoque → Despesas e notas.
      </p>

      <div className="mt-3 pt-3 border-t border-[#DDDCD5] space-y-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-[#6E6E68] shrink-0">Leitura normal</span>
          <span className="text-right">modelo rápido · cerca de R$ 0,01 por página</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[#6E6E68] shrink-0">Releitura</span>
          <span className="text-right">modelo preciso · algumas dezenas de centavos</span>
        </div>
      </div>

      {!configurada && (
        <div className="text-xs text-[#6B5320] bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm px-3 py-2 mt-3 leading-relaxed">
          <p className="font-semibold">Como ligar:</p>
          <ol className="list-decimal pl-4 mt-1 space-y-0.5">
            <li>Em console.anthropic.com, crie uma conta, adicione crédito e gere uma chave (API Keys → Create Key).</li>
            <li>Na Vercel: projeto do portal → Settings → Environment Variables → adicione <span className="font-mono">ANTHROPIC_API_KEY</span> com a chave, em Production.</li>
            <li>Em Deployments, clique em Redeploy no último deploy. Depois volte aqui e clique em Testar.</li>
          </ol>
          <p className="mt-1">Dica: no console da Anthropic dá para definir um limite de gasto por mês.</p>
        </div>
      )}

      <button
        onClick={testar}
        disabled={pendente}
        className="w-full mt-3 border border-[#131A2E] rounded-sm py-2 text-xs font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'TESTANDO...' : 'TESTAR LEITURA POR IA'}
      </button>
      {resultado && (
        <p className={`text-xs mt-2 leading-relaxed break-words ${resultado.ok ? 'text-[#2E7D4F]' : 'text-[#B00063]'}`}>
          {resultado.texto}
        </p>
      )}
    </div>
  )
}
