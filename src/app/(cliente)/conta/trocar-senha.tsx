'use client'

import { useActionState, useState } from 'react'
import { alterarMinhaSenha } from '@/app/actions/senha'

export default function TrocarSenha() {
  const [estado, acao, pendente] = useActionState(alterarMinhaSenha, null)
  const [ver, setVer] = useState(false)

  const campo =
    'w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm bg-white outline-none focus:border-[#131A2E]'
  const rotulo = 'block text-xs tracking-widest text-[#6E6E68] mb-1.5'

  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="atual" className={rotulo}>
          SENHA ATUAL
        </label>
        <input
          id="atual"
          name="atual"
          type={ver ? 'text' : 'password'}
          required
          autoComplete="current-password"
          className={campo}
        />
      </div>

      <div>
        <label htmlFor="senha" className={rotulo}>
          NOVA SENHA
        </label>
        <input
          id="senha"
          name="senha"
          type={ver ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete="new-password"
          className={campo}
        />
        <p className="text-xs text-[#6E6E68] mt-1">Mínimo de 8 caracteres.</p>
      </div>

      <div>
        <label htmlFor="confirmacao" className={rotulo}>
          CONFIRME A NOVA SENHA
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type={ver ? 'text' : 'password'}
          required
          autoComplete="new-password"
          className={campo}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-[#6E6E68]">
        <input
          type="checkbox"
          checked={ver}
          onChange={(e) => setVer(e.target.checked)}
          className="w-4 h-4 accent-[#131A2E]"
        />
        Mostrar senhas
      </label>

      {estado && !estado.ok && (
        <p className="text-sm text-[#B00063]">{estado.erro}</p>
      )}

      {estado?.ok && (
        <p className="text-sm text-[#2E7D4F]">
          Senha alterada. Use a nova no próximo acesso.
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="w-full sm:w-auto bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'ALTERANDO...' : 'ALTERAR SENHA'}
      </button>
    </form>
  )
}
