'use client'

import { useState, useTransition } from 'react'
import { testarConexaoBling, tirarLimitesNoBling, type LimiteBlingCliente } from '@/app/actions/bling'
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
  const [confirmarLimites, setConfirmarLimites] = useState(false)
  const [limites, setLimites] = useState<LimiteBlingCliente[] | null>(null)
  const [erroLimites, setErroLimites] = useState('')
  const [tirando, iniciarLimites] = useTransition()

  function tirarLimites() {
    setErroLimites('')
    setLimites(null)
    iniciarLimites(async () => {
      const r = await tirarLimitesNoBling()
      setConfirmarLimites(false)
      if (r.ok) setLimites(r.resultado)
      else setErroLimites(r.erro)
    })
  }

  const ROTULO_LIMITE: Record<LimiteBlingCliente['situacao'], string> = {
    tirado: 'limite tirado',
    ja_sem_limite: 'já estava sem limite',
    fora_do_bling: 'não está no Bling',
    erro: 'falhou',
  }

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

          <div className="mt-4 pt-3 border-t border-[#DDDCD5]">
            <p className="text-xs font-semibold text-[#131A2E]">Limite de crédito</p>
            <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
              O limite de crédito vale só no portal. Se o cadastro de um cliente no Bling tiver limite
              próprio, o Bling recusa o pedido de venda mesmo com o crédito aprovado aqui.
            </p>
            {!confirmarLimites ? (
              <button
                onClick={() => setConfirmarLimites(true)}
                disabled={tirando}
                className="w-full mt-2 border border-[#DDDCD5] rounded-sm py-2 text-xs font-semibold tracking-wide hover:border-[#131A2E] disabled:opacity-50"
              >
                TIRAR O LIMITE DO BLING DE TODOS OS CLIENTES
              </button>
            ) : (
              <div className="mt-2 border border-[#C79600] bg-[#FFFBEE] rounded-sm p-3">
                <p className="text-xs text-[#6B5320] leading-relaxed">
                  O portal vai abrir o cadastro de cada cliente no Bling e deixar o limite de crédito
                  sem valor. O resto do cadastro não muda, e cada mudança fica no histórico do cliente.
                  Leva cerca de 1 segundo por cliente.
                </p>
                <div className="flex gap-2 mt-2">
                  <button onClick={tirarLimites} disabled={tirando} className="flex-1 bg-[#131A2E] text-white rounded-sm py-2 text-xs font-semibold tracking-wide disabled:opacity-50">
                    {tirando ? 'TIRANDO…' : 'CONFIRMAR'}
                  </button>
                  <button onClick={() => setConfirmarLimites(false)} disabled={tirando} className="flex-1 border border-[#131A2E] rounded-sm py-2 text-xs font-semibold tracking-wide disabled:opacity-50">
                    CANCELAR
                  </button>
                </div>
              </div>
            )}
            {erroLimites && <p className="text-xs text-[#B00063] mt-2">{erroLimites}</p>}
            {limites && (
              <ul className="mt-2 text-xs divide-y divide-[#EEEDE7] border border-[#DDDCD5] rounded-sm">
                {limites.map((l) => (
                  <li key={l.cliente} className="px-2.5 py-1.5 flex justify-between gap-3">
                    <span className="min-w-0 truncate">{l.cliente}</span>
                    <span className={'shrink-0 ' + (l.situacao === 'erro' ? 'text-[#B00063]' : l.situacao === 'tirado' ? 'text-[#2E7D4F]' : 'text-[#6E6E68]')}>
                      {ROTULO_LIMITE[l.situacao]}
                      {l.situacao === 'tirado' && l.detalhe ? ` (era ${l.detalhe})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {limites?.some((l) => l.situacao === 'erro') && (
              <p className="text-xs text-[#B00063] mt-1 break-words">
                {limites.filter((l) => l.situacao === 'erro').map((l) => `${l.cliente}: ${l.detalhe}`).join(' · ')}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
