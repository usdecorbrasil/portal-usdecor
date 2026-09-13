'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  editarCliente,
  alternarClienteAtivo,
  redefinirSenha,
  atualizarLimiteCredito,
  buscarHistoricoPagamentos,
  arquivarCliente,
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
  arquivado: boolean
  inscricao_estadual: string | null
  indicador_ie: number | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
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

export default function DetalheCliente({
  cliente,
  pagamentos,
}: {
  cliente: Cliente
  pagamentos: Pagamentos
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [editandoLimite, setEditandoLimite] = useState(false)
  const [arquivando, setArquivando] = useState(false)
  const [senhaNova, setSenhaNova] = useState<string | null>(null)
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
      router.refresh()
    })
  }

  function novaSenha() {
    iniciar(async () => {
      const r = await redefinirSenha(cliente.id)
      if (r.ok) setSenhaNova(r.senha)
    })
  }

  function arquivar() {
    iniciar(async () => {
      const r = await arquivarCliente(cliente.id)
      if (r.ok) router.push('/admin/clientes')
      setArquivando(false)
    })
  }

  return (
    <div>
      {cliente.arquivado && (
        <div className="bg-[#EEEDE7] border-l-4 border-[#6E6E68] rounded-r-sm p-4 mt-3 mb-5">
          <p className="text-sm font-semibold tracking-tight">
            Este cliente está arquivado
          </p>
          <p className="text-xs text-[#6E6E68] mt-1">
            O acesso está desativado. O e-mail original foi liberado para
            reuso.
          </p>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mt-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
            {cliente.razao_social}
          </h1>
          <p className="text-sm text-[#6E6E68] mt-1 font-mono">
            {formatarCnpj(cliente.cnpj)}
          </p>
          <p className="text-sm text-[#6E6E68]">{cliente.email}</p>
          {cliente.contato && (
            <p className="text-sm text-[#6E6E68]">{cliente.contato}</p>
          )}
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-sm whitespace-nowrap shrink-0 ${
            cliente.ativo
              ? 'bg-[#E3F0E8] text-[#2E7D4F]'
              : 'bg-[#EAE9E3] text-[#6E6E68]'
          }`}
        >
          {cliente.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-[#6E6E68]">Preço por metro</span>
          <span className="font-mono font-semibold text-lg">
            R$ {brl(cliente.preco_metro)}
          </span>
        </div>

        {/* ---- limite de crédito ---- */}
        <div className="mt-4 pt-4 border-t border-[#DDDCD5]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-[#6E6E68]">Limite de crédito</span>
            <span className="font-mono font-semibold text-lg">
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
              Sem limite definido — boleto parcelado indisponível para este
              cliente.
            </p>
          )}
        </div>

        {/* ---- histórico de pagamento ---- */}
        <ResumoPagamentos clienteId={cliente.id} pagamentos={pagamentos} />
      </div>

      {senhaNova && (
        <div className="mt-4 bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-4">
          <p className="text-sm text-[#2E7D4F] font-semibold mb-2">
            Nova senha — anote agora
          </p>
          <code className="block bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 font-mono text-sm break-all">
            {senhaNova}
          </code>
        </div>
      )}

      {!cliente.arquivado && (
        <>
          {arquivando ? (
            <div className="mt-5 border border-[#B00063] bg-[#FFF6FA] rounded-sm p-4">
              <p className="text-sm leading-relaxed mb-4">
                <strong>Arquivar {cliente.razao_social}?</strong> O acesso é
                desativado e o e-mail{' '}
                <code className="font-mono">{cliente.email}</code> fica livre
                para reuso. O histórico de pedidos e pagamentos é preservado.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setArquivando(false)}
                  className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold"
                >
                  VOLTAR
                </button>
                <button
                  onClick={arquivar}
                  disabled={pendente}
                  className="bg-[#B00063] text-white rounded-sm py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {pendente ? '...' : 'ARQUIVAR'}
                </button>
              </div>
            </div>
          ) : confirmando ? (
            <div className="mt-5 border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-4">
              <p className="text-sm leading-relaxed mb-4">
                <strong>
                  {cliente.ativo ? 'Desativar' : 'Reativar'}{' '}
                  {cliente.razao_social}?
                </strong>{' '}
                {cliente.ativo
                  ? 'O login é bloqueado imediatamente. Catálogo e histórico são preservados.'
                  : 'O acesso ao portal volta a funcionar.'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConfirmando(false)}
                  className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold"
                >
                  VOLTAR
                </button>
                <button
                  onClick={alternar}
                  disabled={pendente}
                  className="bg-[#C79600] text-white rounded-sm py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {pendente ? '...' : 'CONFIRMAR'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
              <button
                onClick={() => setEditando(true)}
                className="border border-[#DDDCD5] rounded-sm py-2.5 text-xs tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
              >
                EDITAR
              </button>
              <button
                onClick={() => setEditandoLimite(true)}
                className="border border-[#DDDCD5] rounded-sm py-2.5 text-xs tracking-wide text-[#6E6E68] hover:border-[#0090D8] hover:text-[#0090D8]"
              >
                LIMITE DE CRÉDITO
              </button>
              <button
                onClick={novaSenha}
                disabled={pendente}
                className="border border-[#DDDCD5] rounded-sm py-2.5 text-xs tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E] disabled:opacity-50"
              >
                {pendente ? '...' : 'NOVA SENHA'}
              </button>
              <button
                onClick={() => setConfirmando(true)}
                className="border border-[#DDDCD5] rounded-sm py-2.5 text-xs tracking-wide text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063]"
              >
                {cliente.ativo ? 'DESATIVAR' : 'REATIVAR'}
              </button>
              <button
                onClick={() => setArquivando(true)}
                className="col-span-2 sm:col-span-4 border border-[#DDDCD5] rounded-sm py-2.5 text-xs tracking-wide text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063]"
              >
                ARQUIVAR CLIENTE
              </button>
            </div>
          )}
        </>
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
      <div className="mt-4 pt-4 border-t border-[#DDDCD5]">
        <p className="text-sm text-[#6E6E68]">
          Sem histórico de boletos ainda.
        </p>
      </div>
    )
  }

  const temAtraso = pagamentos.vencidosNaoPagos > 0

  return (
    <div className="mt-4 pt-4 border-t border-[#DDDCD5]">
      <div className="text-sm text-[#6E6E68] mb-2">Histórico de pagamento</div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-[#2E7D4F]">
          {pagamentos.pagosEmDia} em dia
        </span>
        {pagamentos.pagosComAtraso > 0 && (
          <span className="text-[#C79600]">
            {pagamentos.pagosComAtraso} pago
            {pagamentos.pagosComAtraso > 1 ? 's' : ''} com atraso
          </span>
        )}
        {temAtraso && (
          <span className="text-[#B00063] font-semibold">
            {pagamentos.vencidosNaoPagos} vencido
            {pagamentos.vencidosNaoPagos > 1 ? 's' : ''} não pago
            {pagamentos.vencidosNaoPagos > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {temAtraso && (
        <div className="bg-[#FBEAF0] border border-[#B00063] rounded-sm px-3 py-2 mt-2 text-sm">
          <span className="font-mono font-semibold text-[#B00063]">
            R$ {brl(pagamentos.valorVencido)}
          </span>{' '}
          em atraso · maior atraso: {pagamentos.maiorAtrasoDias} dia
          {pagamentos.maiorAtrasoDias !== 1 ? 's' : ''}
        </div>
      )}

      <button
        onClick={alternarHistorico}
        className="text-sm text-[#0090D8] hover:underline mt-2"
      >
        {aberto ? 'OCULTAR HISTÓRICO' : 'VER HISTÓRICO COMPLETO'}
      </button>

      {aberto && (
        <div className="mt-2 space-y-1.5">
          {pendente && <p className="text-xs text-[#6E6E68]">Carregando...</p>}

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
    return <span className="text-[#C79600]">pago com {diasAtraso}d atraso</span>
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
      if (r.ok) {
        aoFechar()
        window.location.reload()
      } else setErro(r.erro)
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
                defaultValue={cliente.preco_metro.toFixed(2).replace('.', ',')}
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm font-mono"
              />
              <p className="text-xs text-[#6E6E68] mt-1">
                Vale para todas as artes deste cliente
              </p>
            </div>
          </div>

          {/* Sem estes campos o contato no Bling não serve para faturar */}
          <div className="border-t border-[#EFEEE8] pt-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] mb-3">
              Dados fiscais — necessários para nota fiscal
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="ec-indicador_ie"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  INSCRIÇÃO ESTADUAL
                </label>
                <select
                  id="ec-indicador_ie"
                  name="indicador_ie"
                  defaultValue={String(cliente.indicador_ie ?? 9)}
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
                >
                  <option value="9">Não contribuinte</option>
                  <option value="1">Contribuinte de ICMS</option>
                  <option value="2">Contribuinte isento</option>
                </select>
              </div>
              <Campo
                nome="inscricao_estadual"
                rotulo="Nº DA INSCRIÇÃO ESTADUAL"
                valor={cliente.inscricao_estadual ?? ''}
                opcional
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Campo nome="cep" rotulo="CEP" valor={cliente.cep ?? ''} opcional />
              <div className="sm:col-span-2">
                <Campo nome="endereco" rotulo="ENDEREÇO" valor={cliente.endereco ?? ''} opcional />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Campo nome="numero" rotulo="NÚMERO" valor={cliente.numero ?? ''} opcional />
              <div className="sm:col-span-2">
                <Campo nome="complemento" rotulo="COMPLEMENTO" valor={cliente.complemento ?? ''} opcional />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Campo nome="bairro" rotulo="BAIRRO" valor={cliente.bairro ?? ''} opcional />
              <Campo nome="municipio" rotulo="MUNICÍPIO" valor={cliente.municipio ?? ''} opcional />
              <div>
                <label
                  htmlFor="ec-uf"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  UF
                </label>
                <select
                  id="ec-uf"
                  name="uf"
                  defaultValue={cliente.uf ?? ''}
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
                >
                  <option value="">—</option>
                  <option value="AC">AC</option>
                  <option value="AL">AL</option>
                  <option value="AP">AP</option>
                  <option value="AM">AM</option>
                  <option value="BA">BA</option>
                  <option value="CE">CE</option>
                  <option value="DF">DF</option>
                  <option value="ES">ES</option>
                  <option value="GO">GO</option>
                  <option value="MA">MA</option>
                  <option value="MT">MT</option>
                  <option value="MS">MS</option>
                  <option value="MG">MG</option>
                  <option value="PA">PA</option>
                  <option value="PB">PB</option>
                  <option value="PR">PR</option>
                  <option value="PE">PE</option>
                  <option value="PI">PI</option>
                  <option value="RJ">RJ</option>
                  <option value="RN">RN</option>
                  <option value="RS">RS</option>
                  <option value="RO">RO</option>
                  <option value="RR">RR</option>
                  <option value="SC">SC</option>
                  <option value="SP">SP</option>
                  <option value="SE">SE</option>
                  <option value="TO">TO</option>
                </select>
              </div>
            </div>
          </div>

          <p className="text-xs text-[#6E6E68] leading-relaxed">
            Alterar o e-mail também altera o login do cliente. Alterar o preço
            não muda pedidos já feitos. Os dados fiscais são espelhados no Bling.
          </p>

          {estado && !estado.ok && (
            <p className="text-sm text-[#B00063]">{estado.erro}</p>
          )}

          {/* Os dados já estão salvos no portal; o que pode ter falhado é o
              espelho no ERP, e isso trava a nota fiscal lá na frente */}
          {estado && estado.ok && estado.avisoBling && (
            <div className="bg-[#FBF0D9] border border-[#C79600] rounded-sm px-3 py-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C79600]">
                Não foi atualizado no Bling
              </p>
              <p className="text-xs text-[#131A2E] mt-1 leading-relaxed">
                {estado.avisoBling}
              </p>
            </div>
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