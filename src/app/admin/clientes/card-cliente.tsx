'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  editarCliente,
  alternarClienteAtivo,
  redefinirSenha,
} from '@/app/actions/clientes'

type Cliente = {
  id: string
  razao_social: string
  cnpj: string
  email: string
  contato: string | null
  telefone: string | null
  ativo: boolean
}

function formatarCnpj(c: string) {
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export default function CardCliente({ cliente }: { cliente: Cliente }) {
  const [editando, setEditando] = useState(false)
  const [senhaNova, setSenhaNova] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()

  function alternar() {
    iniciar(async () => {
      await alternarClienteAtivo(cliente.id, !cliente.ativo)
      setConfirmando(false)
    })
  }

  function novaSenha() {
    iniciar(async () => {
      const r = await redefinirSenha(cliente.id)
      if (r.ok) setSenhaNova(r.senha)
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

      {senhaNova && (
        <div className="mt-3 bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-3">
          <p className="text-xs text-[#2E7D4F] font-semibold mb-1">
            Nova senha — anote agora
          </p>
          <code className="block bg-white border border-[#DDDCD5] rounded-sm px-2 py-1.5 font-mono text-sm break-all">
            {senhaNova}
          </code>
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
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            onClick={() => setEditando(true)}
            className="border border-[#DDDCD5] rounded-sm py-2 text-xs tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]"
          >
            EDITAR
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

          <Campo nome="telefone" rotulo="TELEFONE" valor={cliente.telefone ?? ''} opcional />

          <p className="text-xs text-[#6E6E68] leading-relaxed">
            Alterar o e-mail também altera o login do cliente.
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