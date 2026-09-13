'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importarDadosDoBling } from '@/app/actions/clientes'

/**
 * Puxa do Bling os dados fiscais de um cliente que já existe lá.
 *
 * Existe para não redigitar endereço e inscrição estadual de clientes antigos,
 * que já estão completos no ERP. Não mexe em e-mail nem preço: o e-mail é o
 * login do cliente.
 */
export default function ImportarBling({
  clienteId,
  jaVinculado,
}: {
  clienteId: string
  jaVinculado: boolean
}) {
  const [resposta, setResposta] = useState<
    { ok: boolean; texto: string } | null
  >(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function importar() {
    setResposta(null)
    iniciar(async () => {
      const r = await importarDadosDoBling(clienteId)
      setResposta(
        r.ok ? { ok: true, texto: r.detalhe } : { ok: false, texto: r.erro }
      )
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="mt-3">
      <button
        onClick={importar}
        disabled={pendente}
        className="border border-[#DDDCD5] rounded-sm px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E] disabled:opacity-50"
      >
        {pendente
          ? 'BUSCANDO...'
          : jaVinculado
          ? 'ATUALIZAR DADOS FISCAIS PELO BLING'
          : 'PUXAR DADOS FISCAIS DO BLING'}
      </button>

      {resposta && (
        <p
          className={
            'text-xs mt-2 leading-relaxed ' +
            (resposta.ok ? 'text-[#2E7D4F]' : 'text-[#B00063]')
          }
        >
          {resposta.texto}
        </p>
      )}
    </div>
  )
}
