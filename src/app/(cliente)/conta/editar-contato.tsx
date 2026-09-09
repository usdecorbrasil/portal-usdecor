'use client'

import { useActionState } from 'react'
import { atualizarMeuContato } from '@/app/actions/conta'

export default function EditarContato({
  contato,
  telefone,
}: {
  contato: string | null
  telefone: string | null
}) {
  const [estado, acao, pendente] = useActionState(atualizarMeuContato, null)

  const campo =
    'w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm bg-white outline-none focus:border-[#131A2E]'
  const rotulo = 'block text-xs tracking-widest text-[#6E6E68] mb-1.5'

  return (
    <form action={acao} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contato" className={rotulo}>
            PESSOA DE CONTATO
          </label>
          <input
            id="contato"
            name="contato"
            defaultValue={contato ?? ''}
            maxLength={120}
            placeholder="Quem falamos no dia a dia"
            className={campo}
          />
        </div>

        <div>
          <label htmlFor="telefone" className={rotulo}>
            TELEFONE
          </label>
          <input
            id="telefone"
            name="telefone"
            defaultValue={telefone ?? ''}
            maxLength={40}
            inputMode="tel"
            placeholder="11999999999"
            className={campo}
          />
        </div>
      </div>

      {estado && !estado.ok && (
        <p className="text-sm text-[#B00063]">{estado.erro}</p>
      )}

      {estado?.ok && (
        <p className="text-sm text-[#2E7D4F]">Dados atualizados.</p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="w-full sm:w-auto border border-[#131A2E] rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'SALVANDO...' : 'SALVAR CONTATO'}
      </button>
    </form>
  )
}
