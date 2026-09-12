'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { lancarStatus, ajustarItem } from '@/app/actions/producao'
import { confirmarRomaneio } from '@/app/actions/romaneio'
import { buscarItensPedido } from '@/app/actions/pedido-admin'
import {
  ModalRomaneio,
  ModalConfirmarValor,
  ModalConfirmarStatus,
  type Item,
} from './modais-status'
import {
  ATIVOS,
  CORES_ESTAGIO,
  ROTULOS,
  destinosPermitidos,
  nivelUrgencia,
  sinal,
  type Tons,
} from './estagios'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type PedidoQuadro = {
  id: string
  numero: number
  cliente: string
  status: string
  unidades: number
  total: number
  metragemImpressa: number | null
  liberadoMetragem: boolean
  temSolicitacao: boolean
  entrada: string
  dias: number
  formaPagamento: string
}

type Grupo = { status: string; itens: PedidoQuadro[] }

type Arrasto = {
  pedido: PedidoQuadro
  destinos: string[]
  x: number
  y: number
  largura: number
}

/** Mudança já solta no destino e ainda pendente de confirmação. */
type Movimento = { pedido: PedidoQuadro; destino: string }

export default function QuadroPedidos({
  grupos,
  dono,
  podeMover,
  valorMinimoBoleto,
}: {
  grupos: Grupo[]
  dono: boolean
  /** Falso quando o filtro de etapa esconde os destinos possíveis */
  podeMover: boolean
  valorMinimoBoleto: number
}) {
  const router = useRouter()
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [movimento, setMovimento] = useState<Movimento | null>(null)
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [pendente, iniciar] = useTransition()

  // Lidos dentro dos handlers de ponteiro, que não podem depender do estado
  // reativo sem reassinar os eventos a cada movimento do dedo
  const arrastoRef = useRef<Arrasto | null>(null)
  const alvoRef = useRef<string | null>(null)

  const estagiosNaTela = grupos.map((g) => g.status)

  // Enquanto arrasta, os destinos válidos que ainda não têm seção na tela
  // viram área tracejada — senão não haveria para onde soltar
  const extras = arrasto
    ? arrasto.destinos.filter((d) => !estagiosNaTela.includes(d))
    : []

  const ordemSecoes = ATIVOS.filter(
    (s) => estagiosNaTela.includes(s) || extras.includes(s)
  )

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  /* ----------------------------- arrastar ----------------------------- */

  function estagioSob(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)
    const secao = el?.closest('[data-estagio]') as HTMLElement | null
    return secao?.dataset.estagio ?? null
  }

  function iniciarArrasto(e: React.PointerEvent, pedido: PedidoQuadro) {
    if (!podeMover || pendente) return
    const destinos = destinosPermitidos(pedido.status)
    if (destinos.length === 0) return

    e.preventDefault()
    e.stopPropagation()

    const cartao = (e.currentTarget as HTMLElement).closest(
      '[data-cartao]'
    ) as HTMLElement | null

    const novo: Arrasto = {
      pedido,
      destinos,
      x: e.clientX,
      y: e.clientY,
      largura: cartao?.offsetWidth ?? 280,
    }

    arrastoRef.current = novo
    alvoRef.current = null
    setArrasto(novo)
    setAlvo(null)
    setRecado('')
  }

  /* --------------------------- confirmação --------------------------- */

  /** Etapas que exigem conferir itens/metragem antes de avançar. */
  function precisaDosItens(destino: string) {
    return destino === 'estampando' || (destino === 'impressao' && dono)
  }

  function abrirConfirmacao(pedido: PedidoQuadro, destino: string) {
    setMovimento({ pedido, destino })
    setItens(null)

    if (!precisaDosItens(destino)) return

    iniciar(async () => {
      const r = await buscarItensPedido(pedido.id)
      if (!r) {
        setErro('Não foi possível carregar os itens do pedido.')
        return
      }
      setItens(r)
    })
  }

  const arrastando = !!arrasto

  useEffect(() => {
    if (!arrastando) return

    function mover(e: PointerEvent) {
      const atual = arrastoRef.current
      if (!atual) return
      e.preventDefault()

      const novo = { ...atual, x: e.clientX, y: e.clientY }
      arrastoRef.current = novo
      setArrasto(novo)

      const sob = estagioSob(e.clientX, e.clientY)
      if (sob !== alvoRef.current) {
        alvoRef.current = sob
        setAlvo(sob)
      }
    }

    function encerrar() {
      arrastoRef.current = null
      alvoRef.current = null
      setArrasto(null)
      setAlvo(null)
    }

    function soltar() {
      const atual = arrastoRef.current
      const destino = alvoRef.current
      encerrar()

      if (!atual || !destino || destino === atual.pedido.status) return

      if (!atual.destinos.includes(destino)) {
        setRecado(
          'Não dá para ir de ' +
            ROTULOS[atual.pedido.status] +
            ' direto para ' +
            ROTULOS[destino] +
            '. A partir dessa etapa só ' +
            atual.destinos.map((d) => ROTULOS[d]).join(' ou ') +
            '.'
        )
        return
      }

      setErro('')
      abrirConfirmacao(atual.pedido, destino)
    }

    function cancelar(e: KeyboardEvent) {
      if (e.key === 'Escape') encerrar()
    }

    // Rolagem automática perto das bordas — sem isso não dá para arrastar
    // até uma etapa que está fora da tela no celular
    let raf = 0
    function rolar() {
      const atual = arrastoRef.current
      if (atual) {
        const margem = 90
        if (atual.y < margem) window.scrollBy(0, -14)
        else if (atual.y > window.innerHeight - margem) window.scrollBy(0, 14)
      }
      raf = requestAnimationFrame(rolar)
    }
    raf = requestAnimationFrame(rolar)

    document.addEventListener('pointermove', mover, { passive: false })
    document.addEventListener('pointerup', soltar)
    document.addEventListener('pointercancel', encerrar)
    document.addEventListener('keydown', cancelar)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('pointerup', soltar)
      document.removeEventListener('pointercancel', encerrar)
      document.removeEventListener('keydown', cancelar)
    }
    // Só precisa (re)assinar quando o arrasto começa ou termina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastando])

  function fechar() {
    setMovimento(null)
    setItens(null)
    setErro('')
  }

  function avancar(destino: string) {
    if (!movimento) return
    const id = movimento.pedido.id
    setErro('')
    iniciar(async () => {
      const r = await lancarStatus(id, destino)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      fechar()
      router.refresh()
    })
  }

  function confirmarRomaneioEAvancar(
    metragem: number,
    alteracoes: { id: string; qtd: number }[],
    motivoAjuste: string
  ) {
    if (!movimento) return
    const id = movimento.pedido.id
    setErro('')

    iniciar(async () => {
      for (const a of alteracoes) {
        const rAjuste = await ajustarItem(a.id, a.qtd, motivoAjuste)
        if (!rAjuste.ok) {
          setErro(rAjuste.erro)
          return
        }
      }

      const r1 = await confirmarRomaneio(id, metragem)
      if (!r1.ok) {
        setErro(r1.erro)
        return
      }

      const r2 = await lancarStatus(id, 'estampando')
      if (!r2.ok) {
        setErro(r2.erro)
        return
      }

      fechar()
      router.refresh()
      window.open('/admin/romaneio?ids=' + id, '_blank')
    })
  }

  /* ------------------------------ render ------------------------------ */

  const carregandoItens =
    !!movimento && precisaDosItens(movimento.destino) && !itens

  return (
    <div className="space-y-8">
      {podeMover && (
        <p className="text-xs text-[#6E6E68] -mt-2">
          Arraste pelo punho <span className="font-mono">⠿</span> à esquerda do
          cartão para mover o pedido de etapa.
        </p>
      )}

      {recado && (
        <div className="flex items-start gap-3 bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm px-4 py-3">
          <p className="text-xs leading-relaxed flex-1">{recado}</p>
          <button
            onClick={() => setRecado('')}
            aria-label="Fechar aviso"
            className="text-xs text-[#6E6E68] hover:text-[#131A2E] shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {erro && !movimento && (
        <p className="text-sm text-[#B00063] bg-white border border-[#B00063] rounded-sm p-3">
          {erro}
        </p>
      )}

      {ordemSecoes.map((status) => {
        const ce = CORES_ESTAGIO[status]
        const grupo = grupos.find((g) => g.status === status)
        const lista = grupo?.itens ?? []
        const destinoValido = !!arrasto && arrasto.destinos.includes(status)
        const sobreEste = !!arrasto && alvo === status
        const ehOrigem = arrasto?.pedido.status === status

        return (
          <section
            key={status}
            data-estagio={status}
            data-busca-grupo
            className="relative"
          >
            <div
              className={
                ce.fundo +
                ' inline-flex items-center gap-2 border-2 border-b-0 ' +
                ce.borda +
                ' rounded-t-lg px-5 py-2 relative z-10 -mb-0.5'
              }
            >
              <h2
                className={
                  ce.texto + ' font-bold tracking-tight text-base sm:text-lg'
                }
              >
                {ROTULOS[status]}
              </h2>
              <span
                data-busca-contagem
                className={
                  ce.texto + ' font-mono font-semibold opacity-70 text-sm'
                }
              >
                {lista.length}
              </span>
            </div>

            <div
              className={
                'border-2 rounded-b-sm rounded-tr-sm p-2.5 sm:p-3 space-y-2 sm:space-y-3 transition-colors ' +
                (sobreEste && destinoValido
                  ? 'border-[#131A2E] bg-[#F4FAFD]'
                  : sobreEste && !destinoValido && !ehOrigem
                  ? 'border-[#B00063] bg-[#FFF6FA]'
                  : destinoValido
                  ? ce.borda + ' border-dashed bg-[#FAFAF7]'
                  : ce.borda + ' bg-white')
              }
            >
              {status === 'estampando' && lista.length > 0 && (
                <BarraRomaneio
                  itens={lista}
                  selecionados={selecionados}
                  onSelecionarTodos={() =>
                    setSelecionados(new Set(lista.map((p) => p.id)))
                  }
                  onLimpar={() => setSelecionados(new Set())}
                />
              )}

              {lista.map((p) => (
                <CartaoPedido
                  key={p.id}
                  p={p}
                  ce={ce}
                  dono={dono}
                  arrastando={arrasto?.pedido.id === p.id}
                  podeArrastar={
                    podeMover && destinosPermitidos(p.status).length > 0
                  }
                  onArrastar={(e) => iniciarArrasto(e, p)}
                  selecionavel={status === 'estampando'}
                  marcado={selecionados.has(p.id)}
                  onMarcar={() => alternarSelecao(p.id)}
                />
              ))}

              {lista.length === 0 && (
                <p className="text-xs text-[#6E6E68] text-center py-6">
                  Solte aqui para mover para {ROTULOS[status]}
                </p>
              )}
            </div>
          </section>
        )
      })}

      {arrasto && (
        <div
          className="fixed z-[60] pointer-events-none opacity-90 shadow-2xl rounded-sm bg-white border-2 border-[#131A2E] px-3 py-2"
          style={{
            width: arrasto.largura,
            left: arrasto.x - arrasto.largura / 2,
            top: arrasto.y - 24,
          }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-mono text-[#6E6E68] shrink-0">
              {arrasto.pedido.numero} ·
            </span>
            <span className="font-semibold tracking-tight text-sm truncate">
              {arrasto.pedido.cliente}
            </span>
          </div>
          <div className="text-[9px] font-mono tracking-[0.11em] text-[#6E6E68]">
            {alvo && arrasto.destinos.includes(alvo)
              ? '→ ' + ROTULOS[alvo].toUpperCase()
              : 'ARRASTE ATÉ A ETAPA'}
          </div>
        </div>
      )}

      {carregandoItens && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#131A2E]/70" />
          <div className="relative bg-white rounded-sm px-6 py-5 w-full max-w-xs">
            <p className="text-sm text-[#6E6E68]">
              {erro || 'Carregando o pedido...'}
            </p>
            <button
              onClick={fechar}
              className="mt-4 w-full border border-[#131A2E] rounded-sm py-2 text-sm font-semibold tracking-wide"
            >
              {erro ? 'FECHAR' : 'CANCELAR'}
            </button>
          </div>
        </div>
      )}

      {movimento && itens && movimento.destino === 'estampando' && (
        <ModalRomaneio
          numero={movimento.pedido.numero}
          itens={itens}
          pendente={pendente}
          erro={erro}
          onCancelar={fechar}
          onConfirmar={confirmarRomaneioEAvancar}
        />
      )}

      {movimento && itens && movimento.destino === 'impressao' && dono && (
        <ModalConfirmarValor
          numero={movimento.pedido.numero}
          itens={itens}
          pendente={pendente}
          erro={erro}
          onCancelar={fechar}
          onConfirmar={() => avancar('impressao')}
        />
      )}

      {movimento && !precisaDosItens(movimento.destino) && (
        <ModalConfirmarStatus
          de={movimento.pedido.status}
          para={movimento.destino}
          pendente={pendente}
          erro={erro}
          avisoBoleto={
            movimento.destino === 'pronto' &&
            dono &&
            movimento.pedido.formaPagamento.startsWith('boleto') &&
            movimento.pedido.total > 0 &&
            movimento.pedido.total < valorMinimoBoleto
              ? { total: movimento.pedido.total, minimo: valorMinimoBoleto }
              : null
          }
          onCancelar={fechar}
          onConfirmar={() => avancar(movimento.destino)}
        />
      )}
    </div>
  )
}

/* ---------------------------- barra do romaneio ---------------------------- */

function BarraRomaneio({
  itens,
  selecionados,
  onSelecionarTodos,
  onLimpar,
}: {
  itens: PedidoQuadro[]
  selecionados: Set<string>
  onSelecionarTodos: () => void
  onLimpar: () => void
}) {
  const marcados = itens.filter((p) => selecionados.has(p.id)).map((p) => p.id)

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-3 py-2">
      <div className="text-xs text-[#6E6E68]">
        {marcados.length > 0 ? (
          <>
            <strong className="text-[#131A2E]">{marcados.length}</strong>{' '}
            selecionado{marcados.length > 1 ? 's' : ''}
          </>
        ) : (
          'Selecione pedidos para gerar o romaneio de calandra'
        )}
      </div>
      <div className="flex items-center gap-3">
        {marcados.length > 0 ? (
          <button
            type="button"
            onClick={onLimpar}
            className="text-xs text-[#6E6E68] hover:text-[#131A2E]"
          >
            limpar
          </button>
        ) : (
          <button
            type="button"
            onClick={onSelecionarTodos}
            className="text-xs text-[#6E6E68] hover:text-[#131A2E]"
          >
            selecionar todos
          </button>
        )}
        <button
          type="button"
          disabled={marcados.length === 0}
          onClick={() => {
            if (marcados.length === 0) return
            window.open('/admin/romaneio?ids=' + marcados.join(','), '_blank')
          }}
          className="bg-[#131A2E] text-white text-xs font-semibold tracking-wide rounded-sm px-3 py-2 disabled:opacity-40"
        >
          GERAR ROMANEIO DE CALANDRA
        </button>
      </div>
    </div>
  )
}

/* -------------------------------- cartão -------------------------------- */

function CartaoPedido({
  p,
  ce,
  dono,
  arrastando,
  podeArrastar,
  onArrastar,
  selecionavel,
  marcado,
  onMarcar,
}: {
  p: PedidoQuadro
  ce: { borda: string; tarja: Tons }
  dono: boolean
  arrastando: boolean
  podeArrastar: boolean
  onArrastar: (e: React.PointerEvent) => void
  selecionavel: boolean
  marcado: boolean
  onMarcar: () => void
}) {
  const s = sinal(p.status, p.dias)
  const tarjaClasse = ce.tarja[nivelUrgencia(s.cl) as keyof Tons]

  return (
    <div
      data-cartao
      data-busca={p.numero + ' ' + p.cliente}
      className={
        'relative bg-white border rounded-sm overflow-hidden ' +
        ce.borda +
        (marcado ? ' ring-2 ring-[#131A2E]' : '') +
        (arrastando ? ' opacity-40' : '')
      }
    >
      {podeArrastar && (
        <button
          type="button"
          aria-label={'Mover pedido ' + p.numero + ' de etapa'}
          onPointerDown={onArrastar}
          onClick={(e) => e.preventDefault()}
          style={{ touchAction: 'none' }}
          className="absolute left-0 top-0 bottom-0 w-8 z-10 flex items-center justify-center text-[#B8B7B0] hover:text-[#131A2E] hover:bg-[#FAFAF7] cursor-grab active:cursor-grabbing"
        >
          <span aria-hidden className="text-sm leading-none font-mono">
            ⠿
          </span>
        </button>
      )}

      {selecionavel && (
        <label className="absolute top-2 right-2 z-10 bg-white border border-[#DDDCD5] rounded-sm p-1 leading-none">
          <input
            type="checkbox"
            checked={marcado}
            onChange={onMarcar}
            className="w-4 h-4 accent-[#131A2E] block"
          />
        </label>
      )}

      <Link href={'/admin/pedidos/' + p.id} className="block">
        <div
          className={
            tarjaClasse +
            ' text-[9px] sm:text-[10px] tracking-[0.13em] font-mono px-3 py-1 sm:px-4 sm:py-1.5 flex justify-between gap-2' +
            (podeArrastar ? ' pl-9' : '') +
            (selecionavel ? ' pr-9' : '')
          }
        >
          <span>{s.tx.toUpperCase()}</span>
          {p.temSolicitacao && (
            <span className="normal-case tracking-normal">
              pediu cancelamento
            </span>
          )}
        </div>

        <div
          className={
            'p-2.5 sm:p-3 flex items-center gap-2' +
            (podeArrastar ? ' pl-9' : '')
          }
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs sm:text-sm font-mono text-[#6E6E68] whitespace-nowrap shrink-0">
                {p.numero} ·
              </span>
              <span className="font-semibold tracking-tight text-base sm:text-lg truncate">
                {p.cliente}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.11em] text-[#6E6E68]">
              ENTROU{' '}
              {new Date(p.entrada).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              })}
            </div>
          </div>

          <div className="text-right shrink-0 text-xs sm:text-sm font-mono text-[#6E6E68]">
            {!p.liberadoMetragem && (
              <div className="whitespace-nowrap">{p.unidades} un</div>
            )}
            {p.liberadoMetragem && !dono && (
              <div className="whitespace-nowrap">
                {brl(p.metragemImpressa ?? 0)} m
              </div>
            )}
            {p.liberadoMetragem && dono && (
              <>
                <div className="whitespace-nowrap">{p.unidades} un</div>
                <div className="font-bold text-[#131A2E] whitespace-nowrap">
                  R$ {brl(p.total)}
                </div>
              </>
            )}
          </div>

          <span className="text-[#DDDCD5] shrink-0 text-lg leading-none">›</span>
        </div>
      </Link>
    </div>
  )
}
