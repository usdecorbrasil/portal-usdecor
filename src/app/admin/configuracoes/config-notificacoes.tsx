'use client'

import { useState, useTransition } from 'react'
import { atualizarConfigNotificacoes } from '@/app/actions/configuracoes'
import {
  TIPOS,
  ROTULOS,
  listarEmails,
  type ConfigNotificacoes,
  type TipoNotificacao,
} from '@/lib/notificacoes/config'

/**
 * Quem da equipe recebe cada aviso. Um campo de texto por tipo, um e-mail por
 * linha — é o formato que se cola de um lugar para outro sem pensar.
 *
 * Recolhido por padrão, como Formas de pagamento: muda raramente, e aberto
 * empurrava o resto da página para baixo.
 */
export default function ConfigNotificacoes({
  configAtual,
}: {
  configAtual: ConfigNotificacoes
}) {
  const [aberto, setAberto] = useState(false)
  const [textos, setTextos] = useState<Record<TipoNotificacao, string>>(() => {
    const t = {} as Record<TipoNotificacao, string>
    for (const tipo of TIPOS) t[tipo] = configAtual[tipo].join('\n')
    return t
  })
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [pendente, iniciar] = useTransition()

  const nova = Object.fromEntries(
    TIPOS.map((tipo) => [tipo, listarEmails(textos[tipo])])
  ) as ConfigNotificacoes

  const mudou = JSON.stringify(nova) !== JSON.stringify(configAtual)

  const resumo = TIPOS.map((tipo) => {
    const n = configAtual[tipo].length
    return `${ROTULOS[tipo].titulo}: ${n === 0 ? 'ninguém' : n === 1 ? '1 pessoa' : `${n} pessoas`}`
  }).join(' · ')

  function salvar() {
    setErro('')
    setSucesso(false)
    iniciar(async () => {
      const r = await atualizarConfigNotificacoes(nova)
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
            Avisos para a equipe
          </span>
          <span className="block text-xs text-[#6E6E68] mt-1 leading-relaxed">
            {aberto
              ? 'Quem recebe e-mail quando algo acontece no portal. Um e-mail por linha. Quem não estiver aqui não recebe nada — inclusive o administrador.'
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
          <div className="mt-4 space-y-4">
            {TIPOS.map((tipo) => (
              <div key={tipo}>
                <label
                  htmlFor={`notif-${tipo}`}
                  className="block text-xs font-semibold tracking-tight"
                >
                  {ROTULOS[tipo].titulo}
                </label>
                <p className="text-[11px] text-[#6E6E68] mb-1.5">
                  {ROTULOS[tipo].descricao}
                </p>
                <textarea
                  id={`notif-${tipo}`}
                  value={textos[tipo]}
                  onChange={(e) => {
                    setSucesso(false)
                    setTextos((t) => ({ ...t, [tipo]: e.target.value }))
                  }}
                  rows={3}
                  spellCheck={false}
                  placeholder="um@email.com&#10;outro@email.com"
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
                />
                {/* O que de fato vai ser salvo, para não haver surpresa com
                    linha inválida silenciosamente descartada */}
                <p className="text-[11px] text-[#9B9A93] mt-1">
                  {nova[tipo].length === 0
                    ? 'Ninguém vai receber este aviso.'
                    : `Vai para: ${nova[tipo].join(', ')}`}
                </p>
              </div>
            ))}
          </div>

          {erro && (
            <p className="text-sm text-[#B00063] mt-3 border border-[#B00063] rounded-sm p-2.5">
              {erro}
            </p>
          )}

          {sucesso && !mudou && (
            <p className="text-xs text-[#2E7D4F] mt-3">Avisos salvos.</p>
          )}

          <button
            type="button"
            onClick={salvar}
            disabled={pendente || !mudou}
            className="mt-4 bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'SALVANDO...' : 'SALVAR'}
          </button>
        </>
      )}
    </div>
  )
}
