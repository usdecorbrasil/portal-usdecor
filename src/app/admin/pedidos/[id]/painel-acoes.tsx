'use client'

import { useState, useTransition } from 'react'
import {
  lancarStatus,
  reimprimir,
  cancelarPedido,
  ajustarItem,
  adicionarItem,
  alterarPrecoPedido,
  alterarFormaPagamento,
} from '@/app/actions/producao'
import {
  confirmarPedido,
  responderSolicitacao,
} from '@/app/actions/confirmacao'
import { confirmarRomaneio } from '@/app/actions/romaneio'
import { buscarCatalogo } from '@/app/actions/pedido-admin'
import {
  ModalRomaneio,
  ModalConfirmarValor,
  ModalConfirmarStatus,
  type Item,
} from '../modais-status'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

type Arte = {
  id: string
  sku: string
  nome: string
  largura: number | null
  altura: number | null
  catalogo: string
  imagemUrl: string | null
}

type Solicitacao = {
  id: string
  texto: string
  criadoEm: string
}

type Tela = null | 'ajustar' | 'preco' | 'forma' | 'reimprimir' | 'cancelar'

function dataPadrao(diasAFrente: number) {
  const d = new Date()
  d.setDate(d.getDate() + diasAFrente)
  return d.toISOString().slice(0, 10)
}

export default function PainelAcoes({
  pedidoId,
  numero,
  cliente,
  clienteId,
  statusAtual,
  usados,
  total,
  reimpressoes,
  podeCancelarOuAjustar,
  formaPagamento,
  parcelasSolicitadas,
  parcelasAtuais,
  maxParcelas,
  valorMinimoBoleto,
  solicitacao,
  precoCliente,
  metragemImpressa,
  itens,
}: {
  pedidoId: string
  numero: number
  cliente: string
  clienteId: string
  statusAtual: string
  usados: string[]
  total: number
  reimpressoes: number
  podeCancelarOuAjustar: boolean
  formaPagamento: string
  parcelasSolicitadas: number | null
  parcelasAtuais: number
  maxParcelas: number
  valorMinimoBoleto: number
  solicitacao: Solicitacao | null
  precoCliente: number
  metragemImpressa: number | null
  itens: Item[]
}) {
  const [tela, setTela] = useState<Tela>(null)
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()
  const [ajustesAbertos, setAjustesAbertos] = useState(false)

  const [qtdParcelas, setQtdParcelas] = useState(
    Math.min(parcelasSolicitadas ?? 3, maxParcelas)
  )
  const [primeiroVencimento, setPrimeiroVencimento] = useState(dataPadrao(30))
  const [statusPendente, setStatusPendente] = useState<string | null>(null)

  const idx = ORDEM.indexOf(statusAtual)
  const aguardando = statusAtual === 'aguardando'
  const emProducao = idx >= 2 && idx <= 5
  const antesDoEstampando = idx < ORDEM.indexOf('estampando')
  const passouNF = usados.some((s) =>
    ['nf_emitida', 'expedido', 'entregue', 'fechado'].includes(s)
  )
  const ehParcelado = formaPagamento === 'boleto_parcelado'

  const precoAtual = itens[0]?.precoMetro ?? 0

  const disponiveis = aguardando
    ? []
    : statusAtual === 'estampando'
    ? MANUAIS.filter((m) => ['corte_costura', 'pronto'].includes(m.chave))
    : MANUAIS.filter((m) => ORDEM.indexOf(m.chave) === idx + 1)

  function avancar(chave: string) {
    setErro('')
    iniciar(async () => {
      const r = await lancarStatus(pedidoId, chave)
      if (!r.ok) setErro(r.erro)
      setStatusPendente(null)
    })
  }

  function confirmarRomaneioEAvancar(
    metragem: number,
    alteracoes: { id: string; qtd: number }[],
    motivoAjuste: string
  ) {
    setErro('')
    iniciar(async () => {
      for (const a of alteracoes) {
        const rAjuste = await ajustarItem(a.id, a.qtd, motivoAjuste)
        if (!rAjuste.ok) {
          setErro(rAjuste.erro)
          return
        }
      }

      const r1 = await confirmarRomaneio(pedidoId, metragem)
      if (!r1.ok) {
        setErro(r1.erro)
        return
      }

      const r2 = await lancarStatus(pedidoId, 'estampando')
      if (!r2.ok) {
        setErro(r2.erro)
        return
      }

      setStatusPendente(null)
      window.open(`/admin/romaneio?ids=${pedidoId}`, '_blank')
    })
  }

  function confirmar() {
    setErro('')

    if (ehParcelado && (qtdParcelas < 2 || qtdParcelas > maxParcelas)) {
      setErro(`Quantidade de parcelas deve ser entre 2 e ${maxParcelas}`)
      return
    }

    iniciar(async () => {
      const r = await confirmarPedido(
        pedidoId,
        ehParcelado
          ? { quantidade: qtdParcelas, primeiroVencimento }
          : undefined
      )
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

  if (tela === 'preco') {
    return (
      <TelaPreco
        precoAtual={precoAtual}
        precoCliente={precoCliente}
        metragemImpressa={metragemImpressa}
        pendente={pendente}
        erro={erro}
        onVoltar={() => {
          setErro('')
          setTela(null)
        }}
        onSalvar={(preco, motivo) =>
          iniciar(async () => {
            const r = await alterarPrecoPedido(pedidoId, preco, motivo)
            if (!r.ok) {
              setErro(r.erro)
              return
            }
            setErro('')
            setTela(null)
          })
        }
      />
    )
  }

  if (tela === 'forma') {
    return (
      <TelaFormaPagamento
        formaAtual={formaPagamento}
        parcelasAtual={parcelasAtuais || parcelasSolicitadas}
        total={total}
        antesDoEstampando={antesDoEstampando}
        maxParcelas={maxParcelas}
        pendente={pendente}
        erro={erro}
        onVoltar={() => {
          setErro('')
          setTela(null)
        }}
        onSalvar={(formaNova, motivo, parcelas, primeiroVenc) =>
          iniciar(async () => {
            const r = await alterarFormaPagamento(
              pedidoId,
              formaNova,
              motivo,
              parcelas,
              primeiroVenc
            )
            if (!r.ok) {
              setErro(r.erro)
              return
            }
            setErro('')
            setTela(null)
          })
        }
      />
    )
  }

  if (tela === 'ajustar') {
    return (
      <TelaAjuste
        clienteId={clienteId}
        itens={itens}
        pendente={pendente}
        erro={erro}
        onVoltar={() => {
          setErro('')
          setTela(null)
        }}
        onSalvar={(alteracoes, novos, motivo) =>
          iniciar(async () => {
            for (const a of alteracoes) {
              const r = await ajustarItem(a.id, a.qtd, motivo)
              if (!r.ok) {
                setErro(r.erro)
                return
              }
            }
            for (const n of novos) {
              const r = await adicionarItem(pedidoId, n.produtoId, n.qtd, motivo)
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

      {aguardando ? (
        <div className="bg-white border-2 border-[#B00063] rounded-sm p-5">
          <h2 className="font-semibold tracking-tight">
            Este pedido aguarda confirmação
          </h2>
          <p className="text-sm text-[#6E6E68] mt-1.5 leading-relaxed">
            Confira as artes e quantidades antes de confirmar. Enquanto não
            confirmado, o cliente ainda pode cancelar por conta própria.
          </p>

          {ehParcelado && (
            <div className="mt-4 border border-[#DDDCD5] bg-[#FAFAF7] rounded-sm p-4">
              <h3 className="text-xs tracking-widest text-[#6E6E68] mb-3">
                CLIENTE PEDIU BOLETO PARCELADO
                {parcelasSolicitadas && ` · ${parcelasSolicitadas}x sugerido`}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="qtd-parcelas"
                    className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
                  >
                    QUANTIDADE (máx. {maxParcelas})
                  </label>
                  <input
                    id="qtd-parcelas"
                    type="number"
                    min={2}
                    max={maxParcelas}
                    value={qtdParcelas}
                    onChange={(e) =>
                      setQtdParcelas(
                        Math.min(
                          maxParcelas,
                          Math.max(2, parseInt(e.target.value) || 2)
                        )
                      )
                    }
                    className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 font-mono text-sm outline-none focus:border-[#131A2E]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="primeiro-venc"
                    className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
                  >
                    1º VENCIMENTO
                  </label>
                  <input
                    id="primeiro-venc"
                    type="date"
                    value={primeiroVencimento}
                    onChange={(e) => setPrimeiroVencimento(e.target.value)}
                    className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
                  />
                </div>
              </div>

              <p className="text-xs text-[#6E6E68] mt-2.5">
                {qtdParcelas}x de R$ {brl(total / qtdParcelas)} · vencimentos a
                cada 30 dias a partir da data escolhida
              </p>
            </div>
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
          <div className="bg-[#FFF3F8] border-2 border-[#E8A9C7] rounded-sm p-4">
            <h2 className="font-semibold tracking-tight text-sm text-[#8A2856]">
              Lançar próxima etapa
            </h2>
            <p className="text-xs text-[#6E6E68] mt-1 mb-3 leading-relaxed">
              {statusAtual === 'estampando'
                ? 'Pedido sem costura vai direto para Pedido pronto.'
                : 'Etapas seguem em ordem, uma de cada vez.'}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {disponiveis.map((m) => (
                <button
                  key={m.chave}
                  onClick={() => setStatusPendente(m.chave)}
                  disabled={pendente}
                  className="text-left bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5 hover:border-[#131A2E] disabled:opacity-50"
                >
                  <span className="block text-sm font-semibold tracking-tight">
                    {m.rotulo}
                  </span>
                  <span className="block text-[9px] font-mono tracking-[0.09em] uppercase text-[#6E6E68] mt-1">
                    {m.chave === 'impressao'
                      ? 'revisa quantidade'
                      : m.chave === 'estampando'
                      ? 'gera romaneio'
                      : m.email
                      ? 'dispara e-mail'
                      : 'sem e-mail'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {statusAtual === 'estampando' && (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold tracking-tight text-sm">
                Romaneio de calandra
              </h2>
              <p className="text-xs text-[#6E6E68] mt-1">
                Gera novamente o PDF com os dados registrados na saída da
                Impressão.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                window.open(`/admin/romaneio?ids=${pedidoId}`, '_blank')
              }
              className="shrink-0 bg-[#131A2E] text-white text-xs font-semibold tracking-wide rounded-sm px-3 py-2.5"
            >
              GERAR ROMANEIO
            </button>
          </div>
        </div>
      )}

      {temAcoes && (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
          <button
            type="button"
            onClick={() => setAjustesAbertos((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <h2 className="font-semibold tracking-tight text-sm">
              Ajustes no pedido
            </h2>
            <span
              className={`text-[#6E6E68] text-xs transition-transform ${
                ajustesAbertos ? 'rotate-180' : ''
              }`}
            >
              ▾
            </span>
          </button>
          {ajustesAbertos && (
            <div className="space-y-2 mt-3">
              {podeCancelarOuAjustar && !passouNF && (
                <BotaoAcao
                  titulo="Ajustar quantidades"
                  legenda="reduz ou aumenta o que será faturado"
                  onClick={() => setTela('ajustar')}
                />
              )}
              {podeCancelarOuAjustar && !passouNF && (
                <BotaoAcao
                  titulo="Alterar preço deste pedido"
                  legenda={`hoje R$ ${brl(precoAtual)}/m · padrão do cliente R$ ${brl(precoCliente)}/m`}
                  onClick={() => setTela('preco')}
                />
              )}
              {podeCancelarOuAjustar && !passouNF && (
                <BotaoAcao
                  titulo="Alterar forma de pagamento"
                  legenda={`hoje: ${ROTULOS_PAGAMENTO[formaPagamento] ?? formaPagamento}`}
                  onClick={() => setTela('forma')}
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
          )}
        </div>
      )}

      {podeCancelarOuAjustar && passouNF && (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
          <button
            type="button"
            onClick={() => setAjustesAbertos((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <h2 className="font-semibold tracking-tight text-sm">
              Ajustes no pedido
            </h2>
            <span
              className={`text-[#6E6E68] text-xs transition-transform ${
                ajustesAbertos ? 'rotate-180' : ''
              }`}
            >
              ▾
            </span>
          </button>
          {ajustesAbertos && (
            <div className="bg-[#EEEDE7] border-l-4 border-[#6E6E68] rounded-r-sm p-3 text-xs text-[#6E6E68] leading-relaxed mt-3">
              Pedido travado — a nota fiscal já foi emitida. Alterações a
              partir daqui exigem devolução ou carta de correção no Bling.
            </div>
          )}
        </div>
      )}

      {statusPendente === 'impressao' && podeCancelarOuAjustar && (
        <ModalConfirmarValor
          numero={numero}
          itens={itens}
          pendente={pendente}
          erro={erro}
          onCancelar={() => {
            setErro('')
            setStatusPendente(null)
          }}
          onConfirmar={() => avancar('impressao')}
        />
      )}

      {statusPendente === 'estampando' && (
        <ModalRomaneio
          numero={numero}
          itens={itens}
          pendente={pendente}
          erro={erro}
          onCancelar={() => {
            setErro('')
            setStatusPendente(null)
          }}
          onConfirmar={confirmarRomaneioEAvancar}
        />
      )}

      {statusPendente &&
        statusPendente !== 'estampando' &&
        !(statusPendente === 'impressao' && podeCancelarOuAjustar) && (
          <ModalConfirmarStatus
            de={statusAtual}
            para={statusPendente}
            pendente={pendente}
            erro={erro}
            avisoBoleto={
              // Só o dono vê valores. O aviso aparece ao fechar a produção,
              // quando a metragem (e portanto o valor) já não muda mais.
              statusPendente === 'pronto' &&
              podeCancelarOuAjustar &&
              formaPagamento.startsWith('boleto') &&
              total > 0 &&
              total < valorMinimoBoleto
                ? { total, minimo: valorMinimoBoleto }
                : null
            }
            onCancelar={() => {
              setErro('')
              setStatusPendente(null)
            }}
            onConfirmar={() => avancar(statusPendente)}
          />
        )}
    </div>
  )
}


/* ---------------- forma de pagamento ---------------- */

function TelaFormaPagamento({
  formaAtual,
  parcelasAtual,
  total,
  antesDoEstampando,
  maxParcelas,
  pendente,
  erro,
  onVoltar,
  onSalvar,
}: {
  formaAtual: string
  parcelasAtual: number | null
  total: number
  antesDoEstampando: boolean
  maxParcelas: number
  pendente: boolean
  erro: string
  onVoltar: () => void
  onSalvar: (
    formaNova: string,
    motivo: string,
    parcelas?: number,
    primeiroVencimento?: string
  ) => void
}) {
  const [formaNova, setFormaNova] = useState(formaAtual)
  const [parcelas, setParcelas] = useState(
    formaAtual === 'boleto_parcelado'
      ? Math.min(parcelasAtual ?? 3, maxParcelas)
      : Math.min(3, maxParcelas)
  )
  const [primeiroVencimento, setPrimeiroVencimento] = useState(dataPadrao(30))
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')

  const ehParcelado = formaNova === 'boleto_parcelado'
  const mudouParcelas =
    ehParcelado && formaAtual === 'boleto_parcelado' && parcelas !== parcelasAtual
  const mudouAlgo = formaNova !== formaAtual || mudouParcelas

  function salvar() {
    if (!mudouAlgo) {
      return setAviso('Escolha uma forma de pagamento ou quantidade de parcelas diferente da atual.')
    }
    if (ehParcelado && (parcelas < 2 || parcelas > maxParcelas)) {
      return setAviso(`Escolha entre 2 e ${maxParcelas} parcelas.`)
    }
    if (motivo.trim().length < 10) {
      return setAviso('Descreva o motivo com pelo menos 10 caracteres.')
    }
    setAviso('')
    onSalvar(
      formaNova,
      motivo.trim(),
      ehParcelado ? parcelas : undefined,
      ehParcelado ? primeiroVencimento : undefined
    )
  }

  return (
    <div className="mt-5 bg-white border border-[#131A2E] rounded-sm p-5">
      <h2 className="font-semibold tracking-tight">
        Alterar forma de pagamento
      </h2>

      <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
        <strong className="block text-[10px] tracking-widest mb-1">
          ATENÇÃO
        </strong>
        Só é possível alterar antes de qualquer boleto/parcela ter sido
        emitido ou pago. Trocando para parcelado, novas parcelas são geradas
        automaticamente.
      </div>

      <div className="mt-4">
        <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
          ATUAL
        </label>
        <div className="font-mono text-[#6E6E68] py-1">
          {ROTULOS_PAGAMENTO[formaAtual] ?? formaAtual}
          {formaAtual === 'boleto_parcelado' && parcelasAtual
            ? ` (${parcelasAtual}x)`
            : ''}
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
          NOVA FORMA
        </label>
        <select
          value={formaNova}
          onChange={(e) => {
            setFormaNova(e.target.value)
            setAviso('')
          }}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white text-sm outline-none focus:border-[#131A2E]"
        >
          <option value="boleto_avista">Boleto à vista</option>
          <option value="boleto_parcelado">Boleto parcelado</option>
          <option value="cartao_credito">Cartão de crédito</option>
          <option value="cartao_debito">Cartão de débito</option>
        </select>
      </div>

      {ehParcelado && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
              QUANTIDADE (máx. {maxParcelas})
            </label>
            <input
              type="number"
              min={2}
              max={maxParcelas}
              value={parcelas}
              onChange={(e) => {
                setParcelas(
                  Math.min(maxParcelas, Math.max(2, parseInt(e.target.value) || 2))
                )
                setAviso('')
              }}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 font-mono text-sm outline-none focus:border-[#131A2E]"
            />
          </div>
          <div>
            <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
              1º VENCIMENTO
            </label>
            <input
              type="date"
              value={primeiroVencimento}
              onChange={(e) => {
                setPrimeiroVencimento(e.target.value)
                setAviso('')
              }}
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E]"
            />
          </div>
          <p className="text-xs text-[#6E6E68] col-span-2">
            {antesDoEstampando
              ? `${parcelas}x`
              : `${parcelas}x de R$ ${brl(total / parcelas)}`}
          </p>
        </div>
      )}

      <div className="mt-4">
        <label
          htmlFor="motivo-forma"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          MOTIVO<span className="text-[#B00063] ml-1">*</span>
        </label>
        <textarea
          id="motivo-forma"
          rows={3}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value)
            setAviso('')
          }}
          placeholder="Ex.: cliente solicitou trocar boleto à vista por parcelado em 3x"
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
        />
        <p className="text-xs text-[#6E6E68] mt-1.5">
          Fica registrado no histórico do pedido.
        </p>
      </div>

      {(aviso || erro) && (
        <p className="text-sm text-[#B00063] mt-3">{aviso || erro}</p>
      )}

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

/* ---------------- preço do pedido ---------------- */

function TelaPreco({
  precoAtual,
  precoCliente,
  metragemImpressa,
  pendente,
  erro,
  onVoltar,
  onSalvar,
}: {
  precoAtual: number
  precoCliente: number
  metragemImpressa: number | null
  pendente: boolean
  erro: string
  onVoltar: () => void
  onSalvar: (preco: number, motivo: string) => void
}) {
  const [valor, setValor] = useState(
    precoAtual.toFixed(2).replace('.', ',')
  )
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')

  const novo = Number(valor.replace(',', '.'))
  const valido = !isNaN(novo) && novo > 0

  // O valor do pedido só existe depois que a metragem real é informada
  // no romaneio, ao finalizar a estampa.
  const metrosTotal = metragemImpressa ?? 0
  const totalAtual = metrosTotal * precoAtual
  const totalNovo = valido ? metrosTotal * novo : 0
  const diferenca = totalNovo - totalAtual

  function salvar() {
    if (!valido) return setAviso('Informe um preço válido.')
    if (novo === precoAtual) return setAviso('O preço informado é igual ao atual.')
    if (motivo.trim().length < 10) {
      return setAviso('Descreva o motivo com pelo menos 10 caracteres.')
    }
    setAviso('')
    onSalvar(novo, motivo.trim())
  }

  return (
    <div className="mt-5 bg-white border border-[#131A2E] rounded-sm p-5">
      <h2 className="font-semibold tracking-tight">
        Alterar preço deste pedido
      </h2>

      <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 mt-3 text-xs leading-relaxed">
        <strong className="block text-[10px] tracking-widest mb-1">
          VALE SÓ PARA ESTE PEDIDO
        </strong>
        O preço padrão do cliente (R$ {brl(precoCliente)}/m) não muda. Pedidos
        anteriores e futuros continuam com o valor de tabela.
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1">
            PREÇO ATUAL DO PEDIDO
          </label>
          <div className="font-mono text-[#6E6E68] py-2">
            R$ {brl(precoAtual)} /m
          </div>
        </div>
        <div>
          <label
            htmlFor="novo-preco"
            className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
          >
            NOVO PREÇO POR METRO
          </label>
          <input
            id="novo-preco"
            inputMode="decimal"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value)
              setAviso('')
            }}
            className="w-full border border-[#131A2E] rounded-sm px-3 py-2 font-mono font-semibold outline-none"
          />
        </div>
      </div>

      {precoAtual !== precoCliente && (
        <button
          onClick={() => {
            setValor(precoCliente.toFixed(2).replace('.', ','))
            setAviso('')
          }}
          className="text-xs text-[#B00063] mt-2"
        >
          Voltar ao preço de tabela (R$ {brl(precoCliente)}/m)
        </button>
      )}

      <div className="mt-4">
        <label
          htmlFor="motivo-preco"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          MOTIVO<span className="text-[#B00063] ml-1">*</span>
        </label>
        <textarea
          id="motivo-preco"
          rows={3}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value)
            setAviso('')
          }}
          placeholder="Ex.: desconto por volume acima de 500 m, negociado por telefone"
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
        />
        <p className="text-xs text-[#6E6E68] mt-1.5">
          Fica registrado no histórico do pedido.
        </p>
      </div>

      {(aviso || erro) && (
        <p className="text-sm text-[#B00063] mt-3">{aviso || erro}</p>
      )}

      <div className="mt-4 pt-4 border-t-2 border-[#131A2E]">
        {metragemImpressa === null ? (
          <p className="text-xs text-[#6E6E68] leading-relaxed">
            O valor deste pedido ainda não existe — ele é calculado ao
            finalizar a estampa, com a metragem realmente impressa. O preço
            definido aqui será usado nesse cálculo.
          </p>
        ) : (
          <>
            <div className="flex justify-between items-baseline text-xs text-[#6E6E68]">
              <span>{brl(metrosTotal)} m impressos</span>
              <span className="font-mono">era R$ {brl(totalAtual)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1.5">
              <span className="font-semibold tracking-tight text-sm">
                NOVO TOTAL
              </span>
              <div className="text-right">
                <div className="font-mono font-semibold text-xl">
                  R$ {brl(totalNovo)}
                </div>
                {valido && diferenca !== 0 && (
                  <div
                    className={`text-[10px] font-mono ${
                      diferenca > 0 ? 'text-[#2E7D4F]' : 'text-[#B00063]'
                    }`}
                  >
                    {diferenca > 0 ? '+' : '−'}R$ {brl(Math.abs(diferenca))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
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

/* ---------------- ajuste de quantidades ---------------- */

function TelaAjuste({
  clienteId,
  itens,
  pendente,
  erro,
  onVoltar,
  onSalvar,
}: {
  clienteId: string
  itens: Item[]
  pendente: boolean
  erro: string
  onVoltar: () => void
  onSalvar: (
    alteracoes: { id: string; qtd: number }[],
    novos: { produtoId: string; qtd: number }[],
    motivo: string
  ) => void
}) {
  const [qtds, setQtds] = useState<Record<string, number>>(
    Object.fromEntries(itens.map((i) => [i.id, i.faturada]))
  )
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState('')

  const [mostrarCatalogo, setMostrarCatalogo] = useState(false)
  const [catalogoCarregado, setCatalogoCarregado] = useState(false)
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false)
  const [catalogo, setCatalogo] = useState<Arte[]>([])
  const [buscaCatalogo, setBuscaCatalogo] = useState('')
  const [novosQtds, setNovosQtds] = useState<Record<string, number>>({})

  const catalogoDisponivel = catalogo.filter(
    (a) => !itens.some((i) => i.produtoId === a.id)
  )
  const catalogoFiltrado = buscaCatalogo.trim()
    ? catalogoDisponivel.filter(
        (a) =>
          a.sku.toLowerCase().includes(buscaCatalogo.toLowerCase()) ||
          a.nome.toLowerCase().includes(buscaCatalogo.toLowerCase())
      )
    : catalogoDisponivel
  const novosEscolhidos = catalogoDisponivel.filter(
    (a) => (novosQtds[a.id] ?? 0) > 0
  )

  async function abrirCatalogo() {
    setMostrarCatalogo(true)
    if (catalogoCarregado) return
    setCarregandoCatalogo(true)
    const lista = await buscarCatalogo(clienteId)
    setCatalogo(lista)
    setCatalogoCarregado(true)
    setCarregandoCatalogo(false)
  }

  // Quantidade não define mais valor: o total sai da metragem impressa,
  // informada ao finalizar a estampa.
  const novasUnidades =
    itens.reduce((a, i) => a + (qtds[i.id] ?? 0), 0) +
    novosEscolhidos.reduce((a, n) => a + (novosQtds[n.id] ?? 0), 0)
  const unidadesAtuais = itens.reduce((a, i) => a + i.faturada, 0)
  const alterou =
    itens.some((i) => (qtds[i.id] ?? 0) !== i.faturada) || novosEscolhidos.length > 0

  function salvar() {
    if (!alterou) {
      return setAviso('Nenhuma quantidade foi alterada nem produto adicionado.')
    }

    const zerado = itens.find((i) => (qtds[i.id] ?? 0) <= 0)
    if (zerado) {
      return setAviso(`${zerado.sku}: a quantidade a faturar deve ser maior que zero.`)
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
      novosEscolhidos.map((n) => ({ produtoId: n.id, qtd: novosQtds[n.id] ?? 0 })),
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
        O pedido é atualizado no Bling e o valor é recalculado. Você pode
        reduzir ou aumentar livremente até a nota fiscal ser emitida, e
        também adicionar novos produtos do catálogo do cliente.
      </div>

      <div className="space-y-3 mt-4">
        {itens.map((i) => {
          const q = qtds[i.id] ?? 0
          const dif = q - i.faturada

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
                      value={q}
                      onChange={(e) => {
                        setAviso('')
                        const limpo = e.target.value.replace(/^0+(?=\d)/, '')
                        setQtds((a) => ({
                          ...a,
                          [i.id]:
                            limpo === '' ? 0 : Math.max(0, parseInt(limpo, 10) || 0),
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
                          [i.id]: (a[i.id] ?? 0) + 1,
                        }))
                      }
                      className="w-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-baseline text-[10px] font-mono text-[#6E6E68] mt-2 pt-2 border-t border-[#DDDCD5]">
                {dif === 0 ? (
                  <span>sem alteração</span>
                ) : (
                  <span className={dif > 0 ? 'text-[#2E7D4F]' : 'text-[#B00063]'}>
                    {dif > 0 ? '+' : '−'}
                    {Math.abs(dif)} un
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        {!mostrarCatalogo ? (
          <button
            type="button"
            onClick={abrirCatalogo}
            className="w-full border border-dashed border-[#DDDCD5] rounded-sm py-2.5 text-sm font-semibold text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            + ADICIONAR PRODUTO DO CATÁLOGO
          </button>
        ) : (
          <div className="border border-[#DDDCD5] rounded-sm p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-xs tracking-widest text-[#6E6E68]">
                CATÁLOGO DO CLIENTE
              </label>
              <button
                type="button"
                onClick={() => setMostrarCatalogo(false)}
                className="text-xs text-[#6E6E68] hover:text-[#131A2E]"
              >
                fechar
              </button>
            </div>

            {carregandoCatalogo && (
              <p className="text-sm text-[#6E6E68]">Carregando catálogo...</p>
            )}

            {!carregandoCatalogo && catalogoDisponivel.length === 0 && (
              <p className="text-sm text-[#6E6E68]">
                {catalogo.length === 0
                  ? 'Este cliente não tem artes ativas no catálogo.'
                  : 'Todos os produtos do catálogo já estão neste pedido.'}
              </p>
            )}

            {!carregandoCatalogo && catalogoDisponivel.length > 0 && (
              <>
                <input
                  value={buscaCatalogo}
                  onChange={(e) => setBuscaCatalogo(e.target.value)}
                  placeholder="Buscar por SKU ou nome"
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2 text-sm outline-none focus:border-[#131A2E] mb-2"
                />
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {catalogoFiltrado.map((a) => {
                    const q = novosQtds[a.id] ?? 0
                    return (
                      <div
                        key={a.id}
                        className={`border rounded-sm p-2.5 flex gap-2.5 items-center ${
                          q > 0 ? 'border-[#131A2E] bg-[#FAFAF8]' : 'border-[#DDDCD5]'
                        }`}
                      >
                        {a.imagemUrl ? (
                          <img
                            src={a.imagemUrl}
                            alt={a.nome}
                            className="w-10 h-10 object-cover rounded-sm shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-[#EEEDE7] rounded-sm shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-mono text-[#131A2E]">
                            {a.sku}
                          </div>
                          <div className="font-semibold tracking-tight text-xs truncate">
                            {a.nome}
                          </div>
                        </div>
                        <div className="flex border border-[#DDDCD5] rounded-sm overflow-hidden shrink-0">
                          <button
                            type="button"
                            aria-label="Diminuir"
                            onClick={() => {
                              setAviso('')
                              setNovosQtds((x) => ({
                                ...x,
                                [a.id]: Math.max(0, (x[a.id] ?? 0) - 1),
                              }))
                            }}
                            className="w-7 h-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={q}
                            onChange={(e) => {
                              setAviso('')
                              setNovosQtds((x) => ({
                                ...x,
                                [a.id]: Math.max(0, parseInt(e.target.value) || 0),
                              }))
                            }}
                            className="w-12 text-center font-mono text-xs outline-none"
                          />
                          <button
                            type="button"
                            aria-label="Aumentar"
                            onClick={() => {
                              setAviso('')
                              setNovosQtds((x) => ({
                                ...x,
                                [a.id]: (x[a.id] ?? 0) + 1,
                              }))
                            }}
                            className="w-7 h-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
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

      {(aviso || erro) && (
        <p className="text-sm text-[#B00063] mt-3">{aviso || erro}</p>
      )}

      <div className="flex justify-between items-baseline mt-4 pt-4 border-t-2 border-[#131A2E]">
        <span className="font-semibold tracking-tight text-sm">
          NOVA QUANTIDADE
        </span>
        <div className="text-right">
          <div className="font-mono font-semibold text-xl">
            {novasUnidades} un
          </div>
          {novasUnidades !== unidadesAtuais && (
            <div
              className={`text-[10px] font-mono ${
                novasUnidades > unidadesAtuais
                  ? 'text-[#2E7D4F]'
                  : 'text-[#B00063]'
              }`}
            >
              eram {unidadesAtuais} un
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
              <li>· O pedido volta para a fila de impressão</li>
              {reimpressoes > 0 && (
                <li className="text-[#B00063]">
                  · Esta seria a <b>{reimpressoes + 1}ª reimpressão</b>
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
            O pedido volta para a etapa Impressão e reentra na fila. O histórico
            registra o retorno — nada é apagado.
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
                Ajuste antes de reimprimir.
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
                titulo="Best Color Tecidos"
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
            tiver sido emitido, e o cliente recebe um e-mail com o motivo.
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