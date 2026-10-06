'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { anexarNf, conferirEnvio, recusarEnvio } from '@/app/actions/envio-tecido'
import { ROTULO_SITUACAO_ENVIO, type SituacaoEnvio } from '@/lib/estoque/tipos'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'

const m = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export type EnvioLinha = {
  id: string
  cliente: string
  tecido: string
  metrosInformados: number
  metrosConferidos: number | null
  nfNumero: string | null
  /** Link assinado, gerado no servidor; nulo quando não há arquivo. */
  nfUrl: string | null
  observacao: string | null
  observacaoConferencia: string | null
  situacao: SituacaoEnvio
  criadoEm: string
  conferidoEm: string | null
  conferidoPor: string | null
}

function dataBr(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

/**
 * Lista de envios de tecido. `modo` muda o que dá para fazer na linha:
 * o cliente anexa a NF enquanto aguarda; a equipe confere ou recusa.
 */
export default function EnviosTecido({
  envios,
  modo,
  titulo = 'ENVIOS DE TECIDO',
}: {
  envios: EnvioLinha[]
  modo: 'cliente' | 'equipe'
  titulo?: string
}) {
  const pendentes = envios.filter((e) => e.situacao === 'enviado').length

  return (
    <section className="mt-7">
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
        {titulo}
        <span className="flex-1 h-px bg-[#DDDCD5]" />
        {pendentes > 0 && (
          <span className="font-mono normal-case tracking-normal text-[#C79600]">
            {pendentes} aguardando
          </span>
        )}
      </h2>

      {envios.length === 0 ? (
        <div className={VAZIO}>Nenhum envio registrado.</div>
      ) : (
        <div className={CAIXA}>
          <div className={CABECALHO}>
            <span className="w-16 shrink-0">Data</span>
            <span className="flex-1 min-w-0">{modo === 'equipe' ? 'Cliente · tecido' : 'Tecido'}</span>
            <span className="w-24 shrink-0 text-right">Informado</span>
            <span className="hidden sm:inline w-24 shrink-0 text-right">Conferido</span>
            <span className="w-28 sm:w-40 shrink-0 text-right">Situação</span>
          </div>
          <div className={CORPO}>
            {envios.map((e) => (
              <Linha key={e.id} envio={e} modo={modo} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Linha({ envio: e, modo }: { envio: EnvioLinha; modo: 'cliente' | 'equipe' }) {
  const [aberto, setAberto] = useState(false)
  const sit = ROTULO_SITUACAO_ENVIO[e.situacao]
  const podeAgir = e.situacao === 'enviado'

  return (
    <div className="bg-white" data-busca={`${e.cliente} ${e.tecido} ${e.nfNumero ?? ''}`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#FAFAF8]">
        <span
          aria-hidden
          className={
            'w-1 self-stretch -my-1.5 shrink-0 ' +
            (e.situacao === 'enviado' ? 'bg-[#C4A868]' : e.situacao === 'conferido' ? 'bg-[#8CB399]' : 'bg-[#B00063]')
          }
        />
        <span className={NUM + ' w-16 shrink-0 text-[#6E6E68]'}>{dataBr(e.criadoEm)}</span>
        <span className="flex-1 min-w-0">
          <span className={NOME + ' block'}>
            {modo === 'equipe' ? `${e.cliente} · ${e.tecido}` : e.tecido}
          </span>
          <span className="block text-[10px] text-[#9B9A93] truncate">
            {e.nfNumero ? `NF ${e.nfNumero}` : 'sem NF informada'}
            {e.nfUrl && (
              <>
                {' · '}
                <a href={e.nfUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">
                  ver arquivo
                </a>
              </>
            )}
            {e.observacao && ` · ${e.observacao}`}
          </span>
        </span>
        <span className={NUM + ' w-24 shrink-0 text-right'}>{m(e.metrosInformados)} m</span>
        <span className={NUM + ' hidden sm:inline w-24 shrink-0 text-right font-semibold ' + (e.metrosConferidos != null ? 'text-[#2E7D4F]' : 'text-[#9B9A93]')}>
          {e.metrosConferidos != null ? `${m(e.metrosConferidos)} m` : '—'}
        </span>
        <span className="w-28 sm:w-40 shrink-0 flex justify-end">
          {podeAgir ? (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className={ETIQUETA + ' ' + sit.cor + ' underline-offset-2 hover:underline'}
            >
              {modo === 'equipe' ? 'conferir' : e.nfUrl || e.nfNumero ? 'aguardando' : 'anexar NF'}
            </button>
          ) : (
            <span className={ETIQUETA + ' ' + sit.cor}>{sit.rotulo}</span>
          )}
        </span>
      </div>

      {!podeAgir && e.observacaoConferencia && (
        <p className="px-2.5 pb-2 text-[11px] text-[#6E6E68] leading-relaxed">
          {e.situacao === 'recusado' ? 'Motivo: ' : 'Conferência: '}
          {e.observacaoConferencia}
          {e.conferidoEm && ` — ${dataBr(e.conferidoEm)}`}
          {e.conferidoPor && modo === 'equipe' && ` por ${e.conferidoPor}`}
        </p>
      )}

      {aberto && podeAgir && (modo === 'equipe' ? <Conferencia envio={e} /> : <AnexarNf envio={e} />)}
    </div>
  )
}

const campo = 'border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]'

function Conferencia({ envio: e }: { envio: EnvioLinha }) {
  const router = useRouter()
  const [metros, setMetros] = useState(String(e.metrosInformados).replace('.', ','))
  const [obs, setObs] = useState('')
  const [recusando, setRecusando] = useState(false)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function confirmar() {
    setErro('')
    const n = Number(metros.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return setErro('Informe a metragem conferida.')
    iniciar(async () => {
      const r = await conferirEnvio(e.id, n, obs.trim() || undefined)
      if (!r.ok) return setErro(r.erro)
      router.refresh()
    })
  }

  function recusar() {
    setErro('')
    if (obs.trim().length < 10) return setErro('Descreva o motivo da recusa com pelo menos 10 caracteres.')
    iniciar(async () => {
      const r = await recusarEnvio(e.id, obs.trim())
      if (!r.ok) return setErro(r.erro)
      router.refresh()
    })
  }

  return (
    <div className="px-2.5 pb-3 pt-1 bg-[#FCFCFA] border-t border-[#EFEEE8]">
      <p className="text-[11px] text-[#6E6E68] leading-relaxed mb-2">
        Meça o que chegou. A metragem conferida é a que entra no saldo do
        cliente — se diferir da informada, a diferença fica anotada no extrato.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {!recusando && (
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">METROS CONFERIDOS</label>
            <input
              type="text"
              inputMode="decimal"
              value={metros}
              onChange={(ev) => setMetros(ev.target.value)}
              className={campo + ' w-32 font-mono'}
            />
          </div>
        )}
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
            {recusando ? 'MOTIVO DA RECUSA' : 'OBSERVAÇÃO (OPCIONAL)'}
          </label>
          <input
            type="text"
            value={obs}
            onChange={(ev) => setObs(ev.target.value)}
            maxLength={500}
            placeholder={recusando ? 'Ex.: chegou tecido diferente do informado' : 'Ex.: 3 rolos, um com avaria'}
            className={campo + ' w-full'}
          />
        </div>
        {recusando ? (
          <>
            <button type="button" onClick={recusar} disabled={pendente} className="bg-[#B00063] text-white rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50">
              {pendente ? 'RECUSANDO…' : 'CONFIRMAR RECUSA'}
            </button>
            <button type="button" onClick={() => setRecusando(false)} className="text-xs text-[#6E6E68] hover:text-[#131A2E] px-2 py-2">
              voltar
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={confirmar} disabled={pendente} className="bg-[#2E7D4F] text-white rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50">
              {pendente ? 'LANÇANDO…' : 'CONFERIR E DAR ENTRADA'}
            </button>
            <button type="button" onClick={() => setRecusando(true)} className="text-xs text-[#B00063] hover:underline px-2 py-2">
              recusar
            </button>
          </>
        )}
      </div>
      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
    </div>
  )
}

function AnexarNf({ envio: e }: { envio: EnvioLinha }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setErro('')
    const dados = new FormData(ev.currentTarget)
    iniciar(async () => {
      const r = await anexarNf(e.id, dados)
      if (!r.ok) return setErro(r.erro)
      router.refresh()
    })
  }

  return (
    <form onSubmit={enviar} className="px-2.5 pb-3 pt-1 bg-[#FCFCFA] border-t border-[#EFEEE8]">
      <p className="text-[11px] text-[#6E6E68] leading-relaxed mb-2">
        Anexe a NF de remessa deste envio. Depois da conferência ela não pode mais ser trocada.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">Nº DA NF</label>
          <input name="nfNumero" type="text" maxLength={40} defaultValue={e.nfNumero ?? ''} className={campo + ' w-32 font-mono'} />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">ARQUIVO (PDF, JPG OU PNG)</label>
          <input name="nf" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-xs text-[#6E6E68] file:mr-3 file:border file:border-[#DDDCD5] file:rounded-sm file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
        </div>
        <button type="submit" disabled={pendente} className="bg-[#131A2E] text-white rounded-sm px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-50">
          {pendente ? 'ENVIANDO…' : 'SALVAR NF'}
        </button>
      </div>
      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
    </form>
  )
}
