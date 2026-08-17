'use client'

import { useState, useTransition } from 'react'
import {
  lancarStatus,
  reimprimir,
  cancelarPedido,
  ajustarItem,
} from '@/app/actions/producao'
import {
  confirmarPedido,
  responderSolicitacao,
} from '@/app/actions/confirmacao'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const teto = (pedida: number) => Math.ceil(pedida * 1.5)

const MANUAIS = [
  { chave: 'impressao', rotulo: 'Impressão', email: true },
  { chave: 'estampando', rotulo: 'Estampando', email: false },
  { chave: 'corte_costura', rotulo: 'Em corte / costura', email: false },
  { chave: 'pronto', rotulo: 'Pedido pronto', email: true },
]

const ORDEM = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'corte_costura',
  'pronto', 'nf_emitida', 'expedido', 'entregue', 'fechado',
]

type Item = {
  id: string
  sku: string
  nome: string
  pedida: number
  faturada: number
  precoMetro: number
  metrosPorUnidade: number
  imagemUrl: string | null
}

type Solicitacao = {
  id: string
  texto: string
  criadoEm: string
}

type Tela = null | 'ajustar' | 'reimprimir' | 'cancelar'

export default function PainelAcoes({
  pedidoId,
  numero,
  cliente,
  statusAtual,
  usados,
  total,
  reimpressoes,
  podeCancelarOuAjustar,
  solicitacao,
  itens,
}: {
  pedidoId: string
  numero: number
  cliente: string
  statusAtual: string
  usados: string[]
  total: number
  reimpressoes: number
  podeCancelarOuAjustar: boolean
  solicitacao: Solicitacao | null
  itens: Item[]
}) {
  const [tela, setTela] = useState<Tela>(null)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const idx = ORDEM.indexOf(statusAtual)
  const aguardando = statusAtual === 'aguardando'
  const emProducao = idx >= 2 && idx <= 5
  const passouNF = usados.some((s) =>
    ['nf_emitida', 'expedido', 'entregue', 'fechado'].includes(s)
  )

  const disponiveis = aguardando
    ? []
    : MANUAIS.filter(
        (m) => ORDEM.indexOf(m.chave) > idx && !usados.includes(m.chave)
      )

  function avancar(chave: string) {
    setErro('')
    iniciar(async () => {
      const r = await lancarStatus(pedidoId, chave)
      if (!r.ok) setErro(r.erro)
    })
  }

  function confirmar() {
    setErro('')
    iniciar(async () => {
      const r = await confirmarPedido(pedidoId)
      if (!r.ok) setErro(r.erro)
    })
  }

  function responder(aceitar: boolean) {
    if (!solicitacao) return
    setErro('')
    iniciar(async () => {
      const r = await responderSolicitacao(solicitacao.id, aceitar)
      if (!r.ok) setErro(r.erro)
    })
  }

  if (tela === 'ajustar') {
    return (
      <TelaAjuste
        itens={itens}
        pendente={pendente}
        erro={erro}
        onVoltar={() => {
          setErro('')
          setTela(null)
        }}
        onSalvar={(alteracoes, motivo) =>
          iniciar(async () => {
            for (const a of alteracoes) {
              const r = await ajustarItem(a.id, a.qtd, motivo)
              if (!r.ok) {
                setErro(r.erro)
                return
              }
            }
            setErro('')
            setTela(null)
          })
        }
      />
    )
  }

  if (tela === 'reimprimir') {
    return (
      <TelaReimpressao
        numero={numero}
        reimpressoes={reimpressoes}
        podeAjustar={podeCancelarOuAjustar}
        pendente={pendente}
        erro={erro}
        onVoltar={() => {
          setErro('')
          setTela(null)
        }}
        onAjustar={() => {
          setErro('')
          setTela('ajustar')
        }}
        onConfirmar={(motivo, custo) =>
          iniciar(async () => {
            const r = await reimprimir(pedidoId, motivo, custo)
            if (r.ok) setTela(null)
            else setErro(r.erro)
          })
        }
      />
    )
  }

  if (tela === 'cancelar') {
    return (
      <TelaCancelamento
        numero={numero}
        cliente={cliente}
        total={total}
        statusAtual={statusAtual}
        pendente={pendente}
        erro={erro}
        onVoltar={() => {
          setErro('')
          setTela(null)
        }}
        onConfirmar={(motivo) =>
          iniciar(async () => {
            const r = await cancelarPedido(pedidoId, motivo)
            if (r.ok) setTela(null)
            else setErro(r.erro)
          })
        }
      />
    )
  }

  const temAcoes =
    (podeCancelarOuAjustar && !passouNF) || (emProducao && idx >= 2)

  return (
    <div className="mt-5">
      {erro && (
        <p className="text-sm text-[#B00063] bg-white border border-[#B00063] rounded-sm p-3 mb-4">
          {erro}
        </p>
      )}

      {/* ---- solicitação de cancelamento pendente ---- */}
      {solicitacao && podeCancelarOuAjustar && (
        <div className="bg-[#F4FAFD] border border-[#0090D8] rounded-sm p-4 mb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold tracking-tight text-sm">
              Cliente pediu cancelamento
            </h2>
            <span className="text-[10px] font-mono text-[#6E6E68] whitespace-nowrap">
              {new Date(solicitacao.criadoEm).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <p className="text-sm italic text-[#6E6E68] mt-2 leading-relaxed">
            &ldquo;{solicitacao.texto}&rdquo;
          </p>
          <p className="text-xs text-[#6E6E68] mt-2">
            Aceitar já cancela o pedido e avisa o cliente.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => responder(false)}
              disabled={pendente}
              className="border border-[#DDDCD5] bg-white rounded-sm py-2 text-xs font-semibold text-[#6E6E68] disabled:opacity-50"
            >
              RECUSAR
            </button>
            <button
              onClick={() => responder(true)}
              disabled={pendente}
              className="bg-[#B00063] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
            >
              {pendente ? '...' : 'ACEITAR E CANCELAR'}
            </button>
          </div>
        </div>
      )}

      {/* ---- confirmação ---- */}
      {aguardando ? (
        <div className="bg-white border-2 border-[#B00063] rounded-sm p-5">
          <h2 className="font-semibold tracking-tight">
            Este pedido aguarda confirmação
          </h2>
          <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
            Confira as artes e quantidades antes de confirmar. Enquanto não
            confirmado, o cliente ainda pode cancelar por conta própria.
          </p>
          {podeCancelarOuAjustar && (
            <p className="text-xs text-[#6E6E68] mt-2">
              Precisa mudar alguma quantidade? Ajuste antes de confirmar.
            </p>
          )}
          <button
            onClick={confirmar}
            disabled={pendente}
            className="w-full mt-4 bg-[#B00063] text-white rounded-sm py-3.5 text-sm font-bold tracking-wider disabled:opacity-50"
          >
            {pendente ? 'CONFIRMANDO...' : 'CONFIRMAR PEDIDO'}
          </button>
        </div>
      ) : (
        disponiveis.length > 0 && (
          <>
            <Titulo>LANÇAR PRÓXIMA ETAPA</Titulo>
            <p className="text-xs text-[#6E6E68] mb-2.5 leading-relaxed">
              Pule o que não se aplica. Um pedido sem costura vai direto de
              Estampando para Pedido pronto.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {disponiveis.map((m) => (
                <button
                  key={m.chave}
                  onClick={() => avancar(m.chave)}
                  disabled={pendente}
                  className="text-left bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5 hover:border-[#131A2E] disabled:opacity-50"
                >
                  <span className="block text-sm font-semibold tracking-tight">
                    {m.rotulo}
                  </span>
                  <span className="block text-[9px] font-mono tracking-[0.09em] uppercase text-[#6E6E68] mt-1">
                    {m.email ? 'dispara e-mail' : 'sem e-mail'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )
      )}

      {temAcoes && (
        <>
          <Titulo>AÇÕES</Titulo>
          <div className="space-y-2">
            {podeCancelarOuAjustar && !passouNF && (
              <BotaoAcao
                titulo="Ajustar quantidades"
                legenda="reduz ou aumenta o que será faturado"
                onClick={() => setTela('ajustar')}
              />
            )}
            {emProducao && idx >= 2 && (
              <BotaoAcao
                titulo="Retornar para reimpressão"
                legenda="volta o pedido para Impressão"
                onClick={() => setTela('reimprimir')}
              />
            )}
            {podeCancelarOuAjustar && !passouNF && (
              <BotaoAcao
                titulo="Cancelar pedido"
                legenda="cancela no Bling e avisa o cliente"
                perigo
                onClick={() => setTela('cancelar')}
              />
            )}
          </div>
        </>
      )}

      {podeCancelarOuAjustar && passouNF && (
        <>
          <Titulo>AÇÕES</Titulo>
          <div className="bg-[#EEEDE7] border-l-4 border-[#6E6E68] rounded-r-sm p-3 text-xs text-[#6E6E68] leading-relaxed">
            Quantidades travadas — a nota fiscal já foi emitida. Alterações a
            partir daqui exigem devolução ou carta de correção no Bling.
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- ajuste de quantidades ---------------- */

function TelaAjuste({
  itens,
  pendente,
  erro,
  onVoltar,
  onSalvar,
}: {
  itens: Item[]
  pendente: boolean
  erro: string
  onVoltar: () => void
  onSalvar: (alteracoes: { id: string; qtd: number }[], motivo: string) => void
}) {
  const [qtds, setQtds] = useState<Record<string, number>>(
    Object.fromEntries(itens.map((i) => [i.id, i.faturada]))
  )
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')

  const novoTotal = itens.reduce(
    (a, i) => a + (qtds[i.id] ?? 0) * i.metrosPorUnidade * i.precoMetro,
    0
  )
  const totalAtual = itens.reduce(
    (a, i) => a + i.faturada * i.metrosPorUnidade * i.precoMetro,
    0
  )
  const alterou = itens.some((i) => (qtds[i.id] ?? 0) !== i.faturada)
  const subiu = novoTotal > totalAtual

  function salvar() {
    if (!alterou) return setAviso('Nenhuma quantidade foi alterada.')

    const estourou = itens.find((i) => (qtds[i.id] ?? 0) > teto(i.pedida))
    if (estourou) {
      return setAviso(
        `${estourou.sku}: máximo de ${teto(estourou.pedida)} un (50% acima do pedido de ${estourou.pedida} un).`
      )
    }

    if (motivo.trim().length < 10) {
      return setAviso(
        'Descreva o motivo com pelo menos 10 caracteres. Ele fica registrado e vai para o cliente.'
      )
    }

    setAviso('')
    onSalvar(
      itens
        .filter((i) => (qtds[i.id] ?? 0) !== i.faturada)
        .map((i) => ({ id: i.id, qtd: qtds[i.id] ?? 0 })),
      motivo.trim()
    )
  }

  return (
    <div className="mt-5 bg-white border border-[#131A2E] rounded-sm p-5">
      <h2 className="font-semibold tracking-tight">Ajustar quantidades</h2>

      <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
        <strong className="block text-[10px] tracking-widest mb-1">
          O QUE ACONTECE AO SALVAR
        </strong>
        O pedido é atualizado no Bling, o valor é recalculado e o cliente vê o
        ajuste no portal. Se o boleto já tiver sido emitido, ele é cancelado e
        reemitido com o novo valor. O limite por item é 50% acima do que foi
        pedido.
      </div>

      <div className="space-y-3 mt-4">
        {itens.map((i) => {
          const q = qtds[i.id] ?? 0
          const dif = q - i.faturada
          const metros = q * i.metrosPorUnidade
          const max = teto(i.pedida)
          const noLimite = q >= max

          return (
            <div key={i.id} className="border border-[#DDDCD5] rounded-sm p-3">
              <div className="flex gap-3">
                {i.imagemUrl ? (
                  <img
                    src={i.imagemUrl}
                    alt={i.nome}
                    className="w-16 h-16 object-cover rounded-sm shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 bg-[#EEEDE7] rounded-sm shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-mono text-[#131A2E]">{i.sku}</div>
                  <div className="font-semibold tracking-tight text-sm mt-0.5">
                    {i.nome}
                  </div>
                  <div className="text-[10px] font-mono text-[#6E6E68] mt-1">
                    {i.metrosPorUnidade.toFixed(2).replace('.', ',')} m/un · R${' '}
                    {brl(i.precoMetro)}/m
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 items-end">
                <div>
                  <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
                    PEDIDO
                  </label>
                  <div className="font-mono text-[#6E6E68] py-2">
                    {i.pedida} un
                  </div>
                </div>
                <div>
                  <label
                    htmlFor={`q-${i.id}`}
                    className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
                  >
                    A FATURAR
                  </label>
                  <div className="flex border border-[#131A2E] rounded-sm overflow-hidden">
                    <button
                      type="button"
                      aria-label="Diminuir"
                      onClick={() =>
                        setQtds((a) => ({
                          ...a,
                          [i.id]: Math.max(0, (a[i.id] ?? 0) - 1),
                        }))
                      }
                      className="w-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                    >
                      −
                    </button>
                    <input
                      id={`q-${i.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={max}
                      value={q}
                      onChange={(e) => {
                        setAviso('')
                        setQtds((a) => ({
                          ...a,
                          [i.id]: Math.max(
                            0,
                            Math.min(max, parseInt(e.target.value) || 0)
                          ),
                        }))
                      }}
                      className="flex-1 w-full py-2 text-center font-mono font-semibold outline-none min-w-0"
                    />
                    <button
                      type="button"
                      aria-label="Aumentar"
                      onClick={() =>
                        setQtds((a) => ({
                          ...a,
                          [i.id]: Math.min(max, (a[i.id] ?? 0) + 1),
                        }))
                      }
                      className="w-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                    >
                      +
                    </button>
                  </div>
                  <p
                    className={`text-[9px] font-mono mt-1 text-right ${
                      noLimite ? 'text-[#C79600]' : 'text-[#6E6E68]'
                    }`}
                  >
                    máx {max} un
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-baseline text-[10px] font-mono text-[#6E6E68] mt-2 pt-2 border-t border-[#DDDCD5]">
                <span>{brl(metros)} m</span>
                {dif === 0 ? (
                  <span>sem alteração</span>
                ) : (
                  <span className={dif > 0 ? 'text-[#2E7D4F]' : 'text-[#B00063]'}>
                    {dif > 0 ? '+' : '−'}
                    {Math.abs(dif)} un · {dif > 0 ? '+' : '−'}R${' '}
                    {brl(Math.abs(dif) * i.metrosPorUnidade * i.precoMetro)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <label
          htmlFor="motivo-ajuste"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          MOTIVO DO AJUSTE<span className="text-[#B00063] ml-1">*</span>
        </label>
        <textarea
          id="motivo-ajuste"
          rows={3}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value)
            setAviso('')
          }}
          placeholder="Ex.: falha no tecido em 5 m — trecho descartado na conferência"
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
        />
        <p className="text-xs text-[#6E6E68] mt-1.5">
          O motivo fica registrado no histórico e é exibido ao cliente.
        </p>
      </div>

      {subiu && (
        <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
          O valor do pedido vai <strong>aumentar</strong>. Confirme com o
          cliente antes de salvar — ele receberá um boleto maior do que o pedido
          original.
        </div>
      )}

      {(aviso || erro) && (
        <p className="text-sm text-[#B00063] mt-3">{aviso || erro}</p>
      )}

      <div className="flex justify-between items-baseline mt-4 pt-4 border-t-2 border-[#131A2E]">
        <span className="font-semibold tracking-tight text-sm">NOVO TOTAL</span>
        <div className="text-right">
          <div className="font-mono font-semibold text-xl">
            R$ {brl(novoTotal)}
          </div>
          {novoTotal !== totalAtual && (
            <div
              className={`text-[10px] font-mono ${
                subiu ? 'text-[#2E7D4F]' : 'text-[#B00063]'
              }`}
            >
              era R$ {brl(totalAtual)}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <button
          onClick={onVoltar}
          className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
        >
          CANCELAR
        </button>
        <button
          onClick={salvar}
          disabled={pendente}
          className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
        >
          {pendente ? 'SALVANDO...' : 'SALVAR'}
        </button>
      </div>
    </div>
  )
}

/* ---------------- reimpressão ---------------- */

function TelaReimpressao({
  numero,
  reimpressoes,
  podeAjustar,
  pendente,
  erro,
  onVoltar,
  onAjustar,
  onConfirmar,
}: {
  numero: number
  reimpressoes: number
  podeAjustar: boolean
  pendente: boolean
  erro: string
  onVoltar: () => void
  onAjustar: () => void
  onConfirmar: (motivo: string, custo: 'interno' | 'cliente') => void
}) {
  const [motivo, setMotivo] = useState('')
  const [custo, setCusto] = useState<'interno' | 'cliente'>('interno')
  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  function seguir() {
    if (motivo.trim().length < 10) {
      return setAviso('Descreva o motivo com pelo menos 10 caracteres.')
    }
    setAviso('')
    setConfirmando(true)
  }

  return (
    <div className="mt-5 bg-white border border-[#C79600] rounded-sm p-5">
      <h2 className="font-semibold tracking-tight">Retornar para reimpressão</h2>

      {confirmando ? (
        <>
          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
            <strong className="block text-sm mb-2">
              Reimprimir o pedido #{numero}?
            </strong>
            <ul className="space-y-1">
              <li>· Novo consumo de tinta e tecido</li>
              <li>
                · Custo registrado como{' '}
                <b>
                  {custo === 'interno'
                    ? 'retrabalho interno'
                    : 'responsabilidade do cliente'}
                </b>
              </li>
              <li>· O retorno fica visível no histórico do pedido</li>
              {reimpressoes > 0 && (
                <li className="text-[#B00063]">
                  · Esta seria a <b>{reimpressoes + 1}ª reimpressão</b> deste
                  pedido
                </li>
              )}
            </ul>
          </div>

          {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={() => setConfirmando(false)}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              VOLTAR
            </button>
            <button
              onClick={() => onConfirmar(motivo.trim(), custo)}
              disabled={pendente}
              className="bg-[#C79600] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? '...' : 'CONFIRMAR'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1">
              O QUE ACONTECE
            </strong>
            O pedido volta para a etapa Impressão. O histórico registra o retorno
            — nada é apagado. O cliente vê que o pedido voltou a produzir.
          </div>

          {podeAjustar && (
            <button
              onClick={onAjustar}
              className="w-full text-left bg-white border border-[#DDDCD5] rounded-sm px-4 py-3 mt-3 hover:border-[#131A2E]"
            >
              <span className="block text-sm font-semibold tracking-tight">
                Precisa mudar a quantidade?
              </span>
              <span className="block text-[10px] text-[#6E6E68] mt-0.5 leading-relaxed">
                Ajuste antes de reimprimir — o limite é 50% acima do pedido.
              </span>
            </button>
          )}

          <div className="mt-4">
            <label
              htmlFor="motivo-reimp"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              MOTIVO<span className="text-[#B00063] ml-1">*</span>
            </label>
            <textarea
              id="motivo-reimp"
              rows={3}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                setAviso('')
              }}
              placeholder="Ex.: cor saiu fora do padrão na conferência"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
            />
          </div>

          <div className="mt-4">
            <span className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
              QUEM ARCA COM O CUSTO
            </span>
            <div className="grid grid-cols-2 gap-2">
              <OpcaoCusto
                ativo={custo === 'interno'}
                titulo="Bello Tecido"
                legenda="retrabalho interno"
                onClick={() => setCusto('interno')}
              />
              <OpcaoCusto
                ativo={custo === 'cliente'}
                titulo="Cliente"
                legenda="arte ou dado errado"
                onClick={() => setCusto('cliente')}
              />
            </div>
          </div>

          {aviso && <p className="text-sm text-[#B00063] mt-3">{aviso}</p>}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={onVoltar}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              CANCELAR
            </button>
            <button
              onClick={seguir}
              className="bg-[#C79600] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              CONTINUAR
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- cancelamento ---------------- */

function TelaCancelamento({
  numero,
  cliente,
  total,
  statusAtual,
  pendente,
  erro,
  onVoltar,
  onConfirmar,
}: {
  numero: number
  cliente: string
  total: number
  statusAtual: string
  pendente: boolean
  erro: string
  onVoltar: () => void
  onConfirmar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const produziu = !['aguardando', 'recebido'].includes(statusAtual)

  function seguir() {
    if (motivo.trim().length < 10) {
      return setAviso('Descreva o motivo com pelo menos 10 caracteres.')
    }
    setAviso('')
    setConfirmando(true)
  }

  return (
    <div className="mt-5 bg-white border border-[#B00063] rounded-sm p-5">
      <h2 className="font-semibold tracking-tight">Cancelar pedido</h2>

      {confirmando ? (
        <>
          <div className="mt-3">
            <strong className="block text-lg tracking-tight">
              Cancelar o pedido #{numero}?
            </strong>
            <p className="text-sm text-[#6E6E68] mt-1">
              Esta ação não pode ser desfeita pelo portal.
            </p>
            <ul className="text-sm space-y-1.5 mt-3">
              <li>· O pedido de venda é cancelado no Bling</li>
              <li>· O boleto emitido é cancelado</li>
              <li>· {cliente} recebe um e-mail com o motivo</li>
              {produziu && (
                <li className="text-[#B00063]">
                  · Já entrou em produção — o custo do material será absorvido
                </li>
              )}
            </ul>
            <div className="flex justify-between items-baseline border-y border-[#DDDCD5] py-3 my-4 text-sm text-[#6E6E68]">
              <span>Valor cancelado</span>
              <strong className="font-mono text-lg text-[#131A2E]">
                R$ {brl(total)}
              </strong>
            </div>
          </div>

          {erro && <p className="text-sm text-[#B00063] mb-3">{erro}</p>}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setConfirmando(false)}
              className="border border-[#131A2E] rounded-sm py-3 text-sm font-semibold tracking-wide"
            >
              VOLTAR
            </button>
            <button
              onClick={() => onConfirmar(motivo.trim())}
              disabled={pendente}
              className="bg-[#B00063] text-white rounded-sm py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? '...' : 'SIM, CANCELAR'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1">
              O QUE ACONTECE
            </strong>
            O pedido de venda é cancelado no Bling, o boleto é cancelado se já
            tiver sido emitido, e o cliente recebe um e-mail com o motivo. O
            pedido continua visível no histórico, marcado como cancelado.
          </div>

          <div className="mt-4">
            <label
              htmlFor="motivo-canc"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              MOTIVO DO CANCELAMENTO<span className="text-[#B00063] ml-1">*</span>
            </label>
            <textarea
              id="motivo-canc"
              rows={3}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                setAviso('')
              }}
              placeholder="Ex.: cliente desistiu por mudança na coleção"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
            />
            <p className="text-xs text-[#6E6E68] mt-1.5">
              O motivo é enviado ao cliente e fica registrado.
            </p>
          </div>

          {aviso && <p className="text-sm text-[#B00063] mt-3">{aviso}</p>}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={onVoltar}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              VOLTAR
            </button>
            <button
              onClick={seguir}
              className="bg-[#B00063] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              CONTINUAR
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- auxiliares ---------------- */

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-6 mb-3 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-[#DDDCD5]" />
    </h2>
  )
}

function BotaoAcao({
  titulo,
  legenda,
  perigo = false,
  onClick,
}: {
  titulo: string
  legenda: string
  perigo?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-sm px-4 py-3 ${
        perigo ? 'border-[#B00063]' : 'border-[#DDDCD5] hover:border-[#131A2E]'
      }`}
    >
      <span
        className={`block text-sm font-semibold tracking-tight ${
          perigo ? 'text-[#B00063]' : ''
        }`}
      >
        {titulo}
      </span>
      <span className="block text-[9px] font-mono tracking-[0.09em] uppercase text-[#6E6E68] mt-0.5">
        {legenda}
      </span>
    </button>
  )
}

function OpcaoCusto({
  ativo,
  titulo,
  legenda,
  onClick,
}: {
  ativo: boolean
  titulo: string
  legenda: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-sm px-3 py-2.5 ${
        ativo
          ? 'bg-[#131A2E] text-white border-[#131A2E]'
          : 'bg-white border-[#DDDCD5]'
      }`}
    >
      <span className="block text-sm font-semibold tracking-tight">{titulo}</span>
      <span
        className={`block text-[9px] font-mono tracking-[0.09em] uppercase mt-0.5 ${
          ativo ? 'text-white/60' : 'text-[#6E6E68]'
        }`}
      >
        {legenda}
      </span>
    </button>
  )
}