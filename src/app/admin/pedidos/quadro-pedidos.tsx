'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { lancarStatus, ajustarItem } from '@/app/actions/producao'
import { confirmarRomaneio } from '@/app/actions/romaneio'
import { buscarItensPedido } from '@/app/actions/pedido-admin'
import { agruparPedidos } from '@/app/actions/agrupamento'
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
  motivoSemDestino,
  nivelUrgencia,
  sinal,
  sinalCurto,
  type CorEstagio,
  type Tons,
} from './estagios'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Quanto o mouse precisa andar para virar arraste em vez de clique. */
const LIMIAR_MOUSE = 6
/** Quanto tempo o dedo precisa ficar parado sobre o cartão. */
const ESPERA_TOQUE = 350
/** Quanto o dedo pode escorregar antes de virar rolagem em vez de arraste. */
const TOLERANCIA_TOQUE = 10

export type PedidoQuadro = {
  id: string
  numero: number
  /** Necessário para o agrupamento: só pedidos do mesmo cliente. */
  clienteId: string
  cliente: string
  status: string
  unidades: number
  total: number
  metragemImpressa: number | null
  liberadoMetragem: boolean
  temSolicitacao: boolean
  /** Observação escrita pelo cliente ao enviar; a produção precisa ver. */
  notas: string | null
  entrada: string
  dias: number
  formaPagamento: string
  emitirNf: boolean
  /** Menor boleto do pedido, ou null quando não é boleto / não tem valor. */
  valorDocumentoBoleto: number | null
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

type Pendente = {
  pedido: PedidoQuadro
  destinos: string[]
  x: number
  y: number
  largura: number
}

export default function QuadroPedidos({
  grupos,
  dono,
  podeMover,
  valorMinimoBoleto,
}: {
  grupos: Grupo[]
  dono: boolean
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
  /** Pedidos prontos marcados para agrupar, aguardando confirmação. */
  const [agrupando, setAgrupando] = useState<PedidoQuadro[] | null>(null)

  // Os handlers de ponteiro rodam fora do ciclo do React e precisam do valor
  // atual sem esperar re-render
  const arrastoRef = useRef<Arrasto | null>(null)
  const alvoRef = useRef<string | null>(null)
  const rafRef = useRef(0)
  /** Impede que o fim do arraste abra o pedido pelo clique do link. */
  const houveArraste = useRef(false)

  const quadroRef = useRef<HTMLDivElement>(null)
  const pedidosRef = useRef<PedidoQuadro[]>([])

  const estagiosNaTela = grupos.map((g) => g.status)

  // Enquanto arrasta, os destinos válidos que ainda não têm seção na tela
  // viram área tracejada — senão não haveria para onde soltar
  const extras = arrasto
    ? arrasto.destinos.filter((d) => !estagiosNaTela.includes(d))
    : []

  const ordemSecoes = ATIVOS.filter(
    (s) => estagiosNaTela.includes(s) || extras.includes(s)
  )

  /** Seções com checkbox: romaneio em Estampando; agrupamento em Pronto (só dono). */
  function selecionavelEm(status: string) {
    return status === 'estampando' || (status === 'pronto' && dono)
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
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

  function fechar() {
    setMovimento(null)
    setItens(null)
    setErro('')
  }

  /* ----------------------------- arrastar ----------------------------- */

  function estagioSob(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)
    const secao = el?.closest('[data-estagio]') as HTMLElement | null
    return secao?.dataset.estagio ?? null
  }

  function rolarSePerto() {
    const atual = arrastoRef.current
    if (atual) {
      const margem = 90
      if (atual.y < margem) window.scrollBy(0, -14)
      else if (atual.y > window.innerHeight - margem) window.scrollBy(0, 14)
    }
    rafRef.current = requestAnimationFrame(rolarSePerto)
  }

  function comecarArraste(inicio: Pendente) {
    const novo: Arrasto = {
      pedido: inicio.pedido,
      destinos: inicio.destinos,
      x: inicio.x,
      y: inicio.y,
      largura: inicio.largura,
    }

    arrastoRef.current = novo
    alvoRef.current = estagioSob(inicio.x, inicio.y)
    houveArraste.current = true

    setArrasto(novo)
    setAlvo(alvoRef.current)
    setRecado('')

    if (!rafRef.current) rafRef.current = requestAnimationFrame(rolarSePerto)
  }

  function atualizarArraste(x: number, y: number) {
    const atual = arrastoRef.current
    if (!atual) return

    const novo = { ...atual, x, y }
    arrastoRef.current = novo
    setArrasto(novo)

    const sob = estagioSob(x, y)
    if (sob !== alvoRef.current) {
      alvoRef.current = sob
      setAlvo(sob)
    }
  }

  function limparArraste() {
    arrastoRef.current = null
    alvoRef.current = null
    setArrasto(null)
    setAlvo(null)

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }

  function soltarArraste() {
    const atual = arrastoRef.current
    const destino = alvoRef.current
    limparArraste()

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

  function movivel(pedido: PedidoQuadro) {
    return podeMover && !pendente && destinosPermitidos(pedido.status).length > 0
  }

  /**
   * Mouse: os ouvintes são presos no próprio pointerdown, e não num efeito —
   * assim nenhum movimento se perde esperando o React re-renderizar. O
   * arraste só começa depois de andar alguns pixels, senão um clique simples
   * deixaria de abrir o pedido.
   */
  function aoPointerDown(e: React.PointerEvent, pedido: PedidoQuadro) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (!podeMover || pendente) return
    if ((e.target as HTMLElement).closest('button, input, label')) return

    const destinos = destinosPermitidos(pedido.status)
    const motivo = motivoSemDestino(pedido.status)
    const largura = (e.currentTarget as HTMLElement).offsetWidth
    const partida = { x: e.clientX, y: e.clientY }

    houveArraste.current = false
    let comecou = false

    function mover(ev: PointerEvent) {
      if (!comecou) {
        const dist = Math.hypot(ev.clientX - partida.x, ev.clientY - partida.y)
        if (dist < LIMIAR_MOUSE) return
        comecou = true

        // Tentou arrastar algo que não se move: explica em vez de ignorar
        if (motivo) {
          houveArraste.current = true
          setRecado(motivo)
          desligar()
          return
        }

        comecarArraste({
          pedido,
          destinos,
          x: ev.clientX,
          y: ev.clientY,
          largura,
        })
      }
      ev.preventDefault()
      atualizarArraste(ev.clientX, ev.clientY)
    }

    function desligar() {
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('pointerup', soltar)
      document.removeEventListener('pointercancel', abortar)
    }

    function soltar() {
      desligar()
      if (comecou && !motivo) soltarArraste()
    }

    function abortar() {
      desligar()
      if (comecou && !motivo) limparArraste()
    }

    document.addEventListener('pointermove', mover)
    document.addEventListener('pointerup', soltar)
    document.addEventListener('pointercancel', abortar)
  }

  /**
   * Toque: segurar parado antes de arrastar, senão o gesto de rolar a lista
   * viraria arraste. Usa eventos de toque nativos porque o `preventDefault`
   * que trava a rolagem no meio do gesto precisa de ouvinte não-passivo.
   */
  useEffect(() => {
    const quadro = quadroRef.current
    if (!quadro || !podeMover) return

    let espera = 0
    let aguardando: Pendente | null = null

    function cancelarEspera() {
      if (espera) {
        window.clearTimeout(espera)
        espera = 0
      }
      aguardando = null
    }

    function aoTocar(e: TouchEvent) {
      const alvoToque = e.target as HTMLElement
      if (alvoToque.closest('button, input, label')) return

      const cartao = alvoToque.closest('[data-pedido-id]') as HTMLElement | null
      const id = cartao?.dataset.pedidoId
      if (!id) return

      const pedido = pedidosRef.current.find((p) => p.id === id)
      if (!pedido) return

      const destinos = destinosPermitidos(pedido.status)
      const motivo = motivoSemDestino(pedido.status)

      const t = e.touches[0]
      cancelarEspera()
      houveArraste.current = false

      aguardando = {
        pedido,
        destinos,
        x: t.clientX,
        y: t.clientY,
        largura: cartao.offsetWidth,
      }

      espera = window.setTimeout(() => {
        const a = aguardando
        espera = 0
        aguardando = null
        if (!a) return

        // Segurou uma linha que não se move: explica, e o toque não abre o pedido
        if (motivo) {
          houveArraste.current = true
          setRecado(motivo)
          return
        }

        comecarArraste(a)
      }, ESPERA_TOQUE)
    }

    // Segurar o dedo num link abre o menu de contexto (Android) ou a prévia
    // do link (iOS), e qualquer um dos dois cancela o toque no meio do gesto
    function aoMenu(e: Event) {
      if (aguardando || arrastoRef.current) e.preventDefault()
    }

    function aoMover(e: TouchEvent) {
      const t = e.touches[0]
      if (!t) return

      // Ainda decidindo: escorregou, então o gesto era rolagem
      if (aguardando) {
        const dist = Math.hypot(
          t.clientX - aguardando.x,
          t.clientY - aguardando.y
        )
        if (dist > TOLERANCIA_TOQUE) cancelarEspera()
        return
      }

      if (!arrastoRef.current) return
      e.preventDefault()
      atualizarArraste(t.clientX, t.clientY)
    }

    function aoSoltar() {
      cancelarEspera()
      if (arrastoRef.current) soltarArraste()
    }

    quadro.addEventListener('touchstart', aoTocar, { passive: true })
    quadro.addEventListener('touchmove', aoMover, { passive: false })
    quadro.addEventListener('touchend', aoSoltar)
    quadro.addEventListener('touchcancel', aoSoltar)
    quadro.addEventListener('contextmenu', aoMenu)

    return () => {
      cancelarEspera()
      quadro.removeEventListener('touchstart', aoTocar)
      quadro.removeEventListener('touchmove', aoMover)
      quadro.removeEventListener('touchend', aoSoltar)
      quadro.removeEventListener('touchcancel', aoSoltar)
      quadro.removeEventListener('contextmenu', aoMenu)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeMover])

  // O handler de toque é nativo e não enxerga as props: precisa da lista
  // atual dos pedidos por fora do render
  useEffect(() => {
    pedidosRef.current = grupos.flatMap((g) => g.itens)
  }, [grupos])

  // Não deixa a rolagem automática viva se a tela sair no meio do arraste
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /* --------------------------- ações no banco --------------------------- */

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

  /** Os pedidos prontos marcados viram um único pedido para cobrança e nota. */
  function executarAgrupamento() {
    if (!agrupando) return
    const ids = agrupando.map((p) => p.id)
    setErro('')
    iniciar(async () => {
      const r = await agruparPedidos(ids)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAgrupando(null)
      setSelecionados(new Set())
      router.push('/admin/pedidos/' + r.pedidoId)
    })
  }

  /* ------------------------------ render ------------------------------ */

  const carregandoItens =
    !!movimento && precisaDosItens(movimento.destino) && !itens

  return (
    <div className="space-y-4" ref={quadroRef}>
      {podeMover && (
        <p className="text-[11px] text-[#6E6E68] -mt-2">
          Arraste a linha até a etapa para mudar o status — no celular, segure
          um instante antes de arrastar.
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

      {erro && !movimento && !agrupando && (
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
        const selecionavel = selecionavelEm(status)

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
                ' flex items-center gap-2 border border-b-0 ' +
                ce.borda +
                ' rounded-t-sm px-2.5 py-1'
              }
            >
              <span
                aria-hidden
                className={ce.faixa + ' w-1.5 h-1.5 rounded-full shrink-0'}
              />
              <h2
                className={
                  ce.texto +
                  ' text-[11px] font-bold uppercase tracking-[0.12em] truncate'
                }
              >
                {ROTULOS[status]}
              </h2>
              <span
                data-busca-contagem
                className={ce.texto + ' font-mono text-[11px] opacity-60'}
              >
                {lista.length}
              </span>
            </div>

            <div
              className={
                'border rounded-b-sm transition-colors ' +
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

              {status === 'pronto' && dono && lista.length > 1 && (
                <BarraAgrupar
                  itens={lista}
                  selecionados={selecionados}
                  pendente={pendente}
                  onLimpar={() => setSelecionados(new Set())}
                  onAgrupar={(marcados) => {
                    setErro('')
                    setAgrupando(marcados)
                  }}
                />
              )}

              {lista.length > 0 && (
                <CabecalhoColunas dono={dono} selecionavel={selecionavel} />
              )}

              <div className="divide-y divide-[#EFEEE8]">
                {lista.map((p) => (
                  <LinhaPedido
                    key={p.id}
                    p={p}
                    ce={ce}
                    dono={dono}
                    arrastando={arrasto?.pedido.id === p.id}
                    movivel={movivel(p)}
                    onPointerDown={(e) => aoPointerDown(e, p)}
                    onClickLink={(e) => {
                      if (houveArraste.current) {
                        e.preventDefault()
                        houveArraste.current = false
                      }
                    }}
                    selecionavel={selecionavel}
                    marcado={selecionados.has(p.id)}
                    onMarcar={() => alternarSelecao(p.id)}
                  />
                ))}
              </div>

              {lista.length === 0 && (
                <p className="text-xs text-[#6E6E68] text-center py-5">
                  Solte aqui para mover para {ROTULOS[status]}
                </p>
              )}
            </div>
          </section>
        )
      })}

      {arrasto && (
        <div
          className="fixed z-[60] pointer-events-none opacity-95 shadow-xl rounded-sm bg-white border border-[#131A2E] px-2.5 py-1.5"
          style={{
            width: arrasto.largura,
            left: arrasto.x - arrasto.largura / 2,
            top: arrasto.y - 24,
          }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-mono text-[#6E6E68] shrink-0">
              {arrasto.pedido.numero}
            </span>
            <span className="font-semibold tracking-tight text-sm truncate">
              {arrasto.pedido.cliente}
            </span>
          </div>
          <div className="text-[9px] font-mono tracking-[0.11em] text-[#6E6E68] mt-0.5">
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
          bloqueioBoleto={
            movimento.destino === 'pronto' &&
            dono &&
            movimento.pedido.valorDocumentoBoleto !== null &&
            movimento.pedido.valorDocumentoBoleto < valorMinimoBoleto
              ? {
                  documento: movimento.pedido.valorDocumentoBoleto,
                  minimo: valorMinimoBoleto,
                }
              : null
          }
          semNf={!movimento.pedido.emitirNf}
          onCancelar={fechar}
          onConfirmar={() => avancar(movimento.destino)}
        />
      )}

      {agrupando && (
        <ModalAgrupar
          pedidos={agrupando}
          pendente={pendente}
          erro={erro}
          onCancelar={() => {
            setAgrupando(null)
            setErro('')
          }}
          onConfirmar={executarAgrupamento}
        />
      )}
    </div>
  )
}

/* ---------------------------- barra do agrupamento ---------------------------- */

/**
 * Regras aplicadas na seleção: dois ou mais pedidos, todos do mesmo cliente,
 * todos com romaneio confirmado. O banco valida de novo ao agrupar.
 */
function BarraAgrupar({
  itens,
  selecionados,
  pendente,
  onLimpar,
  onAgrupar,
}: {
  itens: PedidoQuadro[]
  selecionados: Set<string>
  pendente: boolean
  onLimpar: () => void
  onAgrupar: (marcados: PedidoQuadro[]) => void
}) {
  const marcados = itens.filter((p) => selecionados.has(p.id))
  const clientes = new Set(marcados.map((p) => p.clienteId))

  let aviso = ''
  if (marcados.length === 0) aviso = 'Selecione pedidos do mesmo cliente para agrupar em uma única cobrança'
  else if (clientes.size > 1) aviso = 'Só é possível agrupar pedidos do mesmo cliente'
  else if (marcados.length === 1) aviso = 'Marque ao menos mais um pedido de ' + marcados[0].cliente

  const pronto = marcados.length >= 2 && clientes.size === 1
  const total = marcados.reduce((s, p) => s + p.total, 0)

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap bg-[#FAFAF8] border-b border-[#EFEEE8] px-2.5 py-1.5">
      <div className="text-[11px] text-[#6E6E68]">
        {pronto ? (
          <>
            <strong className="text-[#131A2E]">{marcados.length}</strong> pedidos de{' '}
            <strong className="text-[#131A2E]">{marcados[0].cliente}</strong> · R$ {brl(total)}
          </>
        ) : (
          aviso
        )}
      </div>
      <div className="flex items-center gap-3">
        {marcados.length > 0 && (
          <button
            type="button"
            onClick={onLimpar}
            className="text-[11px] text-[#6E6E68] hover:text-[#131A2E]"
          >
            limpar
          </button>
        )}
        <button
          type="button"
          disabled={!pronto || pendente}
          onClick={() => pronto && onAgrupar(marcados)}
          className="bg-[#131A2E] text-white text-[10px] font-semibold tracking-wide rounded-sm px-2.5 py-1 disabled:opacity-40"
        >
          AGRUPAR
        </button>
      </div>
    </div>
  )
}

function ModalAgrupar({
  pedidos,
  pendente,
  erro,
  onCancelar,
  onConfirmar,
}: {
  pedidos: PedidoQuadro[]
  pendente: boolean
  erro: string
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const total = pedidos.reduce((s, p) => s + p.total, 0)
  const metros = pedidos.reduce((s, p) => s + (p.metragemImpressa ?? 0), 0)
  const precoMedio = metros > 0 ? total / metros : 0
  const numeros = pedidos.map((p) => '#' + p.numero).join(', ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#131A2E]/70" onClick={pendente ? undefined : onCancelar} />
      <div className="relative bg-white rounded-sm px-6 py-5 w-full max-w-sm">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6E68]">
          Agrupar pedidos
        </h3>
        <p className="mt-2 text-sm font-semibold tracking-tight">
          {numeros} · {pedidos[0].cliente}
        </p>

        <dl className="mt-3 text-xs text-[#6E6E68] space-y-1">
          <div className="flex justify-between">
            <dt>Metragem</dt>
            <dd className="font-mono text-[#131A2E]">{brl(metros)} m</dd>
          </div>
          <div className="flex justify-between">
            <dt>Preço médio</dt>
            <dd className="font-mono text-[#131A2E]">R$ {brl(precoMedio)}/m</dd>
          </div>
          <div className="flex justify-between">
            <dt>Total</dt>
            <dd className="font-mono font-bold text-[#131A2E]">R$ {brl(total)}</dd>
          </div>
        </dl>

        <ul className="mt-3 text-xs leading-relaxed text-[#6E6E68] list-disc pl-4 space-y-0.5">
          <li>Nasce um pedido novo, já em Pedido pronto, para cobrança e nota.</li>
          <li>Os pedidos originais saem daqui e ficam como Faturado.</li>
          <li>Dá para desfazer enquanto o novo pedido não tiver cobrança nem nota.</li>
        </ul>

        {erro && (
          <p className="mt-3 text-xs text-[#B00063] border border-[#B00063] rounded-sm px-3 py-2">
            {erro}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancelar}
            disabled={pendente}
            className="flex-1 border border-[#131A2E] rounded-sm py-2 text-sm font-semibold tracking-wide"
          >
            VOLTAR
          </button>
          <button
            onClick={onConfirmar}
            disabled={pendente}
            className="flex-1 bg-[#131A2E] text-white rounded-sm py-2 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'AGRUPANDO…' : 'AGRUPAR'}
          </button>
        </div>
      </div>
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
    <div className="flex items-center justify-between gap-3 flex-wrap bg-[#FAFAF8] border-b border-[#EFEEE8] px-2.5 py-1.5">
      <div className="text-[11px] text-[#6E6E68]">
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
            className="text-[11px] text-[#6E6E68] hover:text-[#131A2E]"
          >
            limpar
          </button>
        ) : (
          <button
            type="button"
            onClick={onSelecionarTodos}
            className="text-[11px] text-[#6E6E68] hover:text-[#131A2E]"
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
          className="bg-[#131A2E] text-white text-[10px] font-semibold tracking-wide rounded-sm px-2.5 py-1 disabled:opacity-40"
        >
          GERAR ROMANEIO
        </button>
      </div>
    </div>
  )
}

/* -------------------------------- linha -------------------------------- */

/** Larguras das colunas, iguais no cabeçalho e nas linhas. */
const COL = {
  numero: 'w-9 shrink-0 tabular-nums',
  entrada: 'w-11 shrink-0 text-right tabular-nums hidden sm:block',
  parado: 'w-16 shrink-0 text-center',
  qtd: 'w-14 shrink-0 text-right tabular-nums',
  valor: 'w-20 shrink-0 text-right tabular-nums hidden sm:block',
}

function CabecalhoColunas({
  dono,
  selecionavel,
}: {
  dono: boolean
  selecionavel: boolean
}) {
  return (
    <div className="flex items-stretch border-b border-[#EFEEE8] bg-[#FCFCFA]">
      <span aria-hidden className="w-1 shrink-0" />
      {selecionavel && <span aria-hidden className="w-[22px] shrink-0" />}
      <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1 text-[8px] sm:text-[9px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">
        <span className={COL.numero}>Nº</span>
        <span className="flex-1 min-w-0">Cliente</span>
        <span className={COL.entrada}>Entrou</span>
        <span className={COL.parado}>Parado há</span>
        <span className={COL.qtd}>{dono ? 'Qtd' : 'Qtd · m'}</span>
        {dono && <span className={COL.valor}>Valor</span>}
        <span aria-hidden className="w-2 shrink-0" />
      </div>
    </div>
  )
}

function LinhaPedido({
  p,
  ce,
  dono,
  arrastando,
  movivel,
  onPointerDown,
  onClickLink,
  selecionavel,
  marcado,
  onMarcar,
}: {
  p: PedidoQuadro
  ce: CorEstagio
  dono: boolean
  arrastando: boolean
  movivel: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClickLink: (e: React.MouseEvent) => void
  selecionavel: boolean
  marcado: boolean
  onMarcar: () => void
}) {
  const s = sinal(p.status, p.dias)
  const nivel = nivelUrgencia(s.cl) as keyof Tons
  const urgente = nivel !== 'leve'
  const entrou = new Date(p.entrada).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

  return (
    <div
      data-cartao
      data-pedido-id={p.id}
      data-busca={p.numero + ' ' + p.cliente}
      onPointerDown={onPointerDown}
      title={s.tx + ' · entrou em ' + entrou}
      // Sem isto o iOS abre a prévia do link ao segurar, cancelando o toque
      style={{ WebkitTouchCallout: 'none' }}
      className={
        'relative flex items-stretch bg-white hover:bg-[#FAFAF8] select-none' +
        (marcado ? ' bg-[#F4FAFD]' : '') +
        (arrastando ? ' opacity-40' : '') +
        (movivel ? ' cursor-grab active:cursor-grabbing' : '')
      }
    >
      {/* tarja do estágio: a cor continua ali, sem ocupar uma linha inteira */}
      <span aria-hidden className={ce.faixa + ' w-1 shrink-0'} />

      {selecionavel && (
        <label className="flex items-center pl-2 shrink-0">
          <input
            type="checkbox"
            checked={marcado}
            onChange={onMarcar}
            aria-label={'Selecionar pedido ' + p.numero}
            className="w-3.5 h-3.5 accent-[#131A2E] block"
          />
        </label>
      )}

      <Link
        href={'/admin/pedidos/' + p.id}
        onClick={onClickLink}
        onDragStart={(e) => e.preventDefault()}
        className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5"
      >
        <span className={COL.numero + ' font-mono text-[11px] text-[#6E6E68]'}>
          {p.numero}
        </span>

        <span className="font-semibold tracking-tight text-sm truncate flex-1 min-w-0">
          {p.cliente}
        </span>

        {!p.emitirNf && (
          <span className="hidden sm:inline text-[9px] font-mono uppercase tracking-wider text-[#8A6A00] bg-[#FBF0D9] rounded-sm px-1 shrink-0">
            sem nf
          </span>
        )}

        {p.temSolicitacao && (
          <span className="hidden sm:inline text-[9px] font-mono uppercase tracking-wider text-[#B00063] border border-[#B00063] rounded-sm px-1 shrink-0">
            cancelar
          </span>
        )}

        {p.notas && (
          <span
            title={'Observação do cliente: ' + p.notas}
            className="text-[9px] font-mono uppercase tracking-wider text-[#0090D8] border border-[#0090D8] rounded-sm px-1 shrink-0"
          >
            obs
          </span>
        )}

        <span className={COL.entrada + ' font-mono text-[11px] text-[#9B9A93]'}>
          {entrou}
        </span>

        <span
          className={
            COL.parado +
            (urgente ? ' ' + ce.tarja[nivel] : ' text-[#9B9A93]') +
            ' text-[9px] font-mono uppercase tracking-wider rounded-sm px-1 py-0.5'
          }
        >
          {sinalCurto(p.status, p.dias)}
        </span>

        <span className={COL.qtd + ' font-mono text-[11px] text-[#6E6E68]'}>
          {p.liberadoMetragem && !dono
            ? brl(p.metragemImpressa ?? 0) + ' m'
            : p.unidades + ' un'}
        </span>

        {dono && (
          <span className={COL.valor + ' font-mono text-[11px] font-bold text-[#131A2E]'}>
            {p.liberadoMetragem ? 'R$ ' + brl(p.total) : '—'}
          </span>
        )}

        <span className="text-[#DDDCD5] shrink-0 leading-none">›</span>
      </Link>
    </div>
  )
}