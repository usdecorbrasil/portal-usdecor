'use client'

import { useState, useTransition } from 'react'
import { testarConexaoBling } from '@/app/actions/bling'
import type { EstadoBling } from '@/lib/bling/cliente'

function dataHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR') +
    ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

export default function IntegracaoBling({ estado }: { estado: EstadoBling }) {
  const [resultado, setResultado] = useState<
    { ok: boolean; texto: string } | null
  >(null)
  const [pendente, iniciar] = useTransition()

  function testar() {
    setResultado(null)
    iniciar(async () => {
      const r = await testarConexaoBling()
      setResultado(
        r.ok ? { ok: true, texto: r.detalhe } : { ok: false, texto: r.erro }
      )
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold tracking-tight text-sm">Bling</h3>
            <span
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                !estado.conectado
                  ? 'bg-[#EAE9E3] text-[#6E6E68]'
                  : estado.expirado
                  ? 'bg-[#FBF0D9] text-[#C79600]'
                  : 'bg-[#E3F0E8] text-[#2E7D4F]'
              }`}
            >
              {!estado.conectado
                ? 'não conectado'
                : estado.expirado
                ? 'token expirado'
                : 'conectado'}
            </span>
          </div>
          <p className="text-xs text-[#6E6E68] mt-1">
            Sincroniza pedidos, boletos e notas fiscais.
          </p>
        </div>

        <a
          href="/api/bling/conectar"
          className={`rounded-sm px-4 py-2 text-xs font-semibold tracking-wide whitespace-nowrap ${
            estado.conectado
              ? 'border border-[#DDDCD5] text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]'
              : 'bg-[#131A2E] text-white'
          }`}
        >
          {estado.conectado ? 'RECONECTAR' : 'CONECTAR'}
        </a>
      </div>

      {estado.conectado && (
        <>
          <div className="mt-3 pt-3 border-t border-[#DDDCD5] space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-[#6E6E68]">Conectado em</span>
              <span className="font-mono">{dataHora(estado.atualizadoEm)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#6E6E68]">Token expira em</span>
              <span
                className={`font-mono ${
                  estado.expirado ? 'text-[#C79600]' : ''
                }`}
              >
                {dataHora(estado.expiraEm)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#6E6E68]">Formato do token</span>
              <span className={`font-mono ${estado.jwt ? 'text-[#2E7D4F]' : 'text-[#C79600]'}`}>
                {estado.jwt ? 'JWT (novo padrão)' : 'opaco (antigo)'}
              </span>
            </div>
          </div>

          {!estado.jwt && (
            <p className="text-xs text-[#8A6A00] bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm px-3 py-2 mt-2 leading-relaxed">
              O Bling vai desligar o token antigo em 15/10/2026. O portal já pede
              o formato novo: ele troca sozinho na próxima renovação (em poucas
              horas) ou agora, se você clicar em &ldquo;Reconectar&rdquo;.
            </p>
          )}

          {estado.expirado && (
            <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
              O token expirou, mas isso é normal — ele dura poucas horas e é
              renovado sozinho na próxima chamada. Só é preciso reconectar se o
              teste abaixo falhar.
            </p>
          )}

          <button
            onClick={testar}
            disabled={pendente}
            className="w-full mt-3 border border-[#131A2E] rounded-sm py-2 text-xs font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'TESTANDO...' : 'TESTAR CONEXÃO'}
          </button>

          {resultado && (
            <p
              className={`text-xs mt-2 leading-relaxed break-words ${
                resultado.ok ? 'text-[#2E7D4F]' : 'text-[#B00063]'
              }`}
            >
              {resultado.texto}
            </p>
          )}
        </>
      )}
    </div>
  )
}
