'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  editarCliente,
  alternarClienteAtivo,
  redefinirSenha,
  atualizarLimiteCredito,
  buscarHistoricoPagamentos,
} from '@/app/actions/clientes'

type Cliente = {
  id: string
  razao_social: string
  cnpj: string
  email: string
  contato: string | null
  telefone: string | null
  preco_metro: number
  limite_credito: number
  em_aberto: number
  ativo: boolean
}

type Pagamentos = {
  pedidosComBoleto: number
  pagosEmDia: number
  pagosComAtraso: number
  vencidosNaoPagos: number
  valorVencido: number
  maiorAtrasoDias: number
} | null

type ItemHistorico = {
  pedidoId: string
  numero: number
  numeroParcela: number | null
  totalParcelas: number | null
  valor: number
  vencimento: string
  pagoEm: string | null
  status: 'pago' | 'vencido' | 'aguardando'
  diasAtraso: number
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dataBr = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

function formatarCnpj(c: string) {
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export default function CardCliente({
  cliente,
  pagamentos,
}: {
  cliente: Cliente
  pagamentos: Pagamentos
}) {
  const [editando, setEditando] = useState(false)
  const [editandoLimite, setEditandoLimite] = useState(false)
  const [senhaNova, setSenhaNova] = useState<string | null>(null)
  const [avisoEmail, setAvisoEmail] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()

  const disponivel = cliente.limite_credito - cliente.em_aberto
  const percentualUsado =
    cliente.limite_credito > 0
      ? Math.min((cliente.em_aberto / cliente.limite_credito) * 100, 100)
      : 0

  function alternar() {
    iniciar(async () => {
      await alternarClienteAtivo(cliente.id, !cliente.ativo)
      setConfirmando(false)
    })
  }

  function novaSenha() {
    iniciar(async () => {
      const r = await redefinirSenha(cliente.id)
      if (r.ok) {
        setSenhaNova(r.enviadoPara)
        setAvisoEmail(null)
      } else {
        setSenhaNova(null)
        setAvisoEmail(r.erro)
      }
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight">{cliente.razao_social}</h2>
          <p className="text-xs text-[#6E6E68] mt-1 font-mono">
            {formatarCnpj(cliente.cnpj)}
          </p>
          <p className="text-xs text-[#6E6E68]">{cliente.email}</p>
          {cliente.contato && (
            <p className="text-xs text-[#6E6E68]">{cliente.contato}</p>
          )}
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-sm whitespace-nowrap ${
            cliente.ativo
              ? 'bg-[#E3F0E8] text-[#2E7D4F]'
              : 'bg-[#EAE9E3] text-[#6E6E68]'
          }`}
        >
          {cliente.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-3 pt-3 border-t border-[#DDDCD5]">
        <span className="text-xs text-[#6E6E68]">Preço por metro</span>
        <span className="font-mono font-semibold">
          R$ {brl(Number(cliente.preco_metro))}
        </span>
      </div>

      {/* ---- limite de crédito ---- */}
      <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-[#6E6E68]">Limite de crédito</span>
          <span className="font-mono font-semibold">
            R$ {brl(cliente.limite_credito)}
          </span>
        </div>

        {cliente.limite_credito > 0 && (
          <>
            <div className="h-1.5 bg-[#EEEDE7] rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  percentualUsado >= 100 ? 'bg-[#B00063]' : 'bg-[#0090D8]'
                }`}
                style={{ width: `${percentualUsado}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[#6E6E68] mt-1.5">
              <span>R$ {brl(cliente.em_aberto)} em aberto</span>
              <span
                className={disponivel < 0 ? 'text-[#B00063] font-semibold' : ''}
              >
                {disponivel < 0
                  ? `R$ ${brl(Math.abs(disponivel))} acima do limite`
                  : `R$ ${brl(disponivel)} disponível`}
              </span>
            </div>
          </>
        )}

        {cliente.limite_credito <= 0 && (
          <p className="text-xs text-[#C79600] mt-1.5">
            Sem limite definido — boleto parcelado indisponível para este cliente.
          </p>
        )}
      </div>

      {/* ---- histórico de pagamento ---- */}
      <ResumoPagamentos clienteId={cliente.id} pagamentos={pagamentos} />

      {senhaNova && (
        <div className="mt-3 bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-3">
          <p className="text-xs text-[#2E7D4F] font-semibold mb-1">
            Link para criar nova senha enviado para
          </p>
          <code className="block bg-white border border-[#DDDCD5] rounded-sm px-2 py-1.5 font-mono text-sm break-all">
            {senhaNova}
          </code>
          {avisoEmail && (
            <p className="text-[11px] text-[#8A6A00] bg-[#FBF0D9] border border-[#C79600] rounded-sm px-2 py-1.5 mt-2 leading-relaxed">
              {avisoEmail}
            </p>
          )}
        </div>
      )}

      {confirmando ? (
        <div className="mt-3 border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-3">
          <p className="text-xs leading-relaxed mb-3">
            <strong>
              {cliente.ativo ? 'Desativar' : 'Reativar'} {cliente.razao_social}?
            </strong>{' '}
            {cliente.ativo
              ? 'O login é bloqueado imediatamente. Catálogo e histórico são preservados.'
              : 'O acesso ao portal volta a funcionar.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmando(false)}
              className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
            >
              VOLTAR
            </button>
            <button
              onClick={alternar}
              disabled={pendente}
              className="bg-[#C79600] text-white rounded-sm py-2 text-xs font-semibold disabled:opacity-50"
            >
              {pendente ? '...' : 'CONFIRMAR'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => setEditando(true)}
            className="border border-[#DDDCD5] rounded-sm py-2 text-xs tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            EDITAR
          </button>
          <button
            onClick={() => setEditandoLimite(true)}
            className="border border-[#DDDCD5] rounded-sm py-2 text-xs tracking-wide text-[#6E6E68] hover:border-[#0090D8] hover:text-[#0090D8]"
          >
            LIMITE DE CRÉDITO
          </button>
          <button
            onClick={novaSenha}
            disabled={pendente}
            className="border border-[#DDDCD5] rounded-sm py-2 text-xs tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E] disabled:opacity-50"
          >
            {pendente ? '...' : 'NOVA SENHA'}
          </button>
          <button
            onClick={() => setConfirmando(true)}
            className="border border-[#DDDCD5] rounded-sm py-2 text-xs tracking-wide text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063]"
          >
            {cliente.ativo ? 'DESATIVAR' : 'REATIVAR'}
          </button>
        </div>
      )}

      {editando && (
        <ModalEditar cliente={cliente} aoFechar={() => setEditando(false)} />
      )}

      {editandoLimite && (
        <ModalLimiteCredito
          cliente={cliente}
          aoFechar={() => setEditandoLimite(false)}
        />
      )}
    </div>
  )
}

function ResumoPagamentos({
  clienteId,
  pagamentos,
}: {
  clienteId: string
  pagamentos: Pagamentos
}) {
  const [aberto, setAberto] = useState(false)
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null)
  const [pendente, iniciar] = useTransition()

  function alternarHistorico() {
    if (aberto) {
      setAberto(false)
      return
    }
    setAberto(true)
    if (!historico) {
      iniciar(async () => {
        const r = await buscarHistoricoPagamentos(clienteId)
        setHistorico(r)
      })
    }
  }

  if (!pagamentos) {
    return (
      <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
        <p className="text-xs text-[#6E6E68]">
          Sem histórico de boletos ainda.
        </p>
      </div>
    )
  }

  const temAtraso = pagamentos.vencidosNaoPagos > 0

  return (
    <div className="mt-3 pt-3 border-t border-[#DDDCD5]">
      <div className="text-xs text-[#6E6E68] mb-1.5">Histórico de pagamento</div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-[#2E7D4F]">
          {pagamentos.pagosEmDia} em dia
        </span>
        {pagamentos.pagosComAtraso > 0 && (
          <span className="text-[#C79600]">
            {pagamentos.pagosComAtraso} pago{pagamentos.pagosComAtraso > 1 ? 's' : ''} com atraso
          </span>
        )}
        {temAtraso && (
          <span className="text-[#B00063] font-semibold">
            {pagamentos.vencidosNaoPagos} vencido{pagamentos.vencidosNaoPagos > 1 ? 's' : ''} não pago{pagamentos.vencidosNaoPagos > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {temAtraso && (
        <div className="bg-[#FBEAF0] border border-[#B00063] rounded-sm px-3 py-2 mt-2 text-xs">
          <span className="font-mono font-semibold text-[#B00063]">
            R$ {brl(pagamentos.valorVencido)}
          </span>{' '}
          em atraso · maior atraso: {pagamentos.maiorAtrasoDias} dia
          {pagamentos.maiorAtrasoDias !== 1 ? 's' : ''}
        </div>
      )}

      <button
        onClick={alternarHistorico}
        className="text-xs text-[#0090D8] hover:underline mt-2"
      >
        {aberto ? 'OCULTAR HISTÓRICO' : 'VER HISTÓRICO COMPLETO'}
      </button>

      {aberto && (
        <div className="mt-2 space-y-1.5">
          {pendente && (
            <p className="text-xs text-[#6E6E68]">Carregando...</p>
          )}

          {!pendente && historico?.length === 0 && (
            <p className="text-xs text-[#6E6E68]">Nenhum boleto registrado.</p>
          )}

          {!pendente &&
            historico?.map((h) => (
              <div
                key={`${h.pedidoId}-${h.numeroParcela ?? 'unico'}`}
                className="flex items-center justify-between gap-2 text-xs bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
              >
                <span className="font-mono text-[#6E6E68]">
                  #{h.numero}
                  {h.numeroParcela && h.totalParcelas
                    ? ` · ${h.numeroParcela}/${h.totalParcelas}`
                    : ''}
                </span>
                <span className="font-mono">{brl(h.valor)}</span>
                <span className="text-[#6E6E68]">
                  venc. {dataBr(h.vencimento)}
                </span>
                <StatusBadge status={h.status} diasAtraso={h.diasAtraso} />
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({
  status,
  diasAtraso,
}: {
  status: ItemHistorico['status']
  diasAtraso: number
}) {
  if (status === 'pago' && diasAtraso === 0) {
    return <span className="text-[#2E7D4F]">pago em dia</span>
  }
  if (status === 'pago' && diasAtraso > 0) {
    return (
      <span className="text-[#C79600]">
        pago com {diasAtraso}d atraso
      </span>
    )
  }
  if (status === 'vencido') {
    return (
      <span className="text-[#B00063] font-semibold">
        vencido há {diasAtraso}d
      </span>
    )
  }
  return <span className="text-[#6E6E68]">aguardando</span>
}

function ModalLimiteCredito({
  cliente,
  aoFechar,
}: {
  cliente: Cliente
  aoFechar: () => void
}) {
  const [novoLimite, setNovoLimite] = useState(
    cliente.limite_credito.toFixed(2).replace('.', ',')
  )
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  function salvar() {
    setErro('')

    const valor = Number(novoLimite.replace(',', '.'))
    if (isNaN(valor) || valor < 0) {
      setErro('Informe um valor válido')
      return
    }

    if (motivo.trim().length < 10) {
      setErro('Motivo precisa ter pelo menos 10 caracteres')
      return
    }

    iniciar(async () => {
      const r = await atualizarLimiteCredito(cliente.id, valor, motivo)
      if (r.ok) aoFechar()
      else setErro(r.erro)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-[#131A2E]/70" onClick={aoFechar} />

      <div className="relative bg-white rounded-sm w-full max-w-md my-8">
        <div className="flex items-center justify-between border-b border-[#DDDCD5] px-5 py-3">
          <h2 className="font-semibold tracking-tight">Limite de crédito</h2>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[#6E6E68]">
            {cliente.razao_social} — hoje com{' '}
            <span className="font-mono font-semibold text-[#131A2E]">
              R$ {brl(cliente.em_aberto)}
            </span>{' '}
            em aberto
          </p>

          <div>
            <label className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
              NOVO LIMITE
            </label>
            <input
              value={novoLimite}
              onChange={(e) => setNovoLimite(e.target.value)}
              inputMode="decimal"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs tracking-widest text-[#6E6E68] mb-1.5">
              MOTIVO<span className="text-[#B00063] ml-1">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Por que o limite está mudando (mín. 10 caracteres)"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
            />
          </div>

          {erro && <p className="text-sm text-[#B00063]">{erro}</p>}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
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
      </div>
    </div>
  )
}

function ModalEditar({
  cliente,
  aoFechar,
}: {
  cliente: Cliente
  aoFechar: () => void
}) {
  const [estado, acao, pendente] = useActionState(editarCliente, null)

  useEffect(() => {
    if (estado?.ok) aoFechar()
  }, [estado, aoFechar])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-[#131A2E]/70" onClick={aoFechar} />

      <div className="relative bg-white rounded-sm w-full max-w-lg my-8">
        <div className="flex items-center justify-between border-b border-[#DDDCD5] px-5 py-3">
          <h2 className="font-semibold tracking-tight">Editar cliente</h2>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form action={acao} className="p-5 space-y-4">
          <input type="hidden" name="id" value={cliente.id} />

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo nome="razao_social" rotulo="RAZÃO SOCIAL" valor={cliente.razao_social} />
            <Campo nome="cnpj" rotulo="CNPJ" valor={cliente.cnpj} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo nome="email" rotulo="E-MAIL DE ACESSO" valor={cliente.email} tipo="email" />
            <Campo nome="contato" rotulo="CONTATO" valor={cliente.contato ?? ''} opcional />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo nome="telefone" rotulo="TELEFONE" valor={cliente.telefone ?? ''} opcional />
            <div>
              <label
                htmlFor="ec-preco_metro"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                PREÇO POR METRO
              </label>
              <input
                id="ec-preco_metro"
                name="preco_metro"
                required
                inputMode="decimal"
                defaultValue={Number(cliente.preco_metro)
                  .toFixed(2)
                  .replace('.', ',')}
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
              />
              <p className="text-xs text-[#6E6E68] mt-1">
                Vale para todas as artes deste cliente
              </p>
            </div>
          </div>

          <p className="text-xs text-[#6E6E68] leading-relaxed">
            Alterar o e-mail também altera o login do cliente. Alterar o preço
            não muda pedidos já feitos.
          </p>

          {estado && !estado.ok && (
            <p className="text-sm text-[#B00063]">{estado.erro}</p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
              className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'SALVANDO...' : 'SALVAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Campo({
  nome,
  rotulo,
  valor,
  tipo = 'text',
  opcional = false,
}: {
  nome: string
  rotulo: string
  valor: string
  tipo?: string
  opcional?: boolean
}) {
  return (
    <div>
      <label
        htmlFor={`ec-${nome}`}
        className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
      >
        {rotulo}
      </label>
      <input
        id={`ec-${nome}`}
        name={nome}
        type={tipo}
        required={!opcional}
        defaultValue={valor}
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
      />
    </div>
  )
}