'use client'

import { useActionState, useEffect, useState } from 'react'
import { criarCliente } from '@/app/actions/clientes'

export default function FormularioCliente() {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(criarCliente, null)

  useEffect(() => {
    if (estado?.ok) setAberto(true)
  }, [estado])

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="w-full sm:w-auto bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide"
      >
        + CADASTRAR NOVO CLIENTE
      </button>
    )
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold tracking-tight">Novo cliente</h2>
        <button
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <form action={acao} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo nome="razao_social" rotulo="RAZÃO SOCIAL" obrigatorio />
          <Campo nome="cnpj" rotulo="CNPJ" obrigatorio placeholder="00000000000000" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo nome="email" rotulo="E-MAIL DE ACESSO" tipo="email" obrigatorio />
          <Campo nome="contato" rotulo="CONTATO" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo nome="telefone" rotulo="TELEFONE" placeholder="11999999999" />
          <Campo
            nome="preco_metro"
            rotulo="PREÇO POR METRO"
            obrigatorio
            numerico
            placeholder="8,86"
            dica="Vale para todas as artes deste cliente"
          />
        </div>

        {estado && !estado.ok && (
          <p className="text-sm text-[#B00063]">{estado.erro}</p>
        )}

        {estado && estado.ok && (
          <div className="bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-4">
            <p className="text-sm font-semibold text-[#2E7D4F] mb-2">
              Cliente cadastrado
            </p>
            <p className="text-xs text-[#131A2E] mb-2">
              Senha provisória — anote agora, ela não será exibida de novo:
            </p>
            <code className="block bg-white border border-[#DDDCD5] rounded-sm px-3 py-2 font-mono text-sm break-all">
              {estado.senha}
            </code>

            {/* O cliente foi criado no portal de qualquer forma; o que pode ter
                falhado é o espelho no ERP, e isso trava o pedido lá na frente */}
            {estado.avisoBling && (
              <div className="bg-[#FBF0D9] border border-[#C79600] rounded-sm px-3 py-2 mt-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#C79600]">
                  Não foi cadastrado no Bling
                </p>
                <p className="text-xs text-[#131A2E] mt-1 leading-relaxed">
                  {estado.avisoBling}
                </p>
                <p className="text-[11px] text-[#6E6E68] mt-1.5">
                  Cadastre o contato no Bling antes do primeiro pedido deste
                  cliente, senão o pedido não será enviado ao ERP.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pendente}
            className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'CADASTRANDO...' : 'CADASTRAR CLIENTE'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="border border-[#DDDCD5] rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide text-[#6E6E68]"
          >
            FECHAR
          </button>
        </div>
      </form>
    </div>
  )
}

function Campo({
  nome,
  rotulo,
  tipo = 'text',
  obrigatorio = false,
  placeholder,
  dica,
  numerico = false,
}: {
  nome: string
  rotulo: string
  tipo?: string
  obrigatorio?: boolean
  placeholder?: string
  dica?: string
  numerico?: boolean
}) {
  return (
    <div>
      <label
        htmlFor={nome}
        className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
      >
        {rotulo}
        {obrigatorio && <span className="text-[#B00063] ml-1">*</span>}
      </label>
      <input
        id={nome}
        name={nome}
        type={tipo}
        required={obrigatorio}
        placeholder={placeholder}
        inputMode={numerico ? 'decimal' : undefined}
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
      />
      {dica && <p className="text-xs text-[#6E6E68] mt-1">{dica}</p>}
    </div>
  )
}