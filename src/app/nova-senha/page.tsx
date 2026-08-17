'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { definirNovaSenha } from '@/app/actions/senha'

export default function NovaSenhaPage() {
  const [estado, acao, pendente] = useActionState(definirNovaSenha, null)
  const router = useRouter()

  useEffect(() => {
    if (estado?.ok) {
      const t = setTimeout(() => {
        router.refresh()
        router.push('/')
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [estado, router])

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F2F1ED] px-5">
      <div className="w-full max-w-sm">
        <Image
          src="/logo-horizontal.png"
          alt="Bello Tecido"
          width={483}
          height={120}
          priority
          className="h-14 w-auto mx-auto -translate-x-2"
        />

        <h1 className="text-lg font-semibold tracking-tight text-center mt-6">
          Criar nova senha
        </h1>

        {estado?.ok ? (
          <div className="mt-6 bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-5 text-center">
            <p className="text-sm font-semibold text-[#2E7D4F]">
              Senha alterada
            </p>
            <p className="text-xs text-[#131A2E] mt-2">
              Entrando no portal...
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#6E6E68] text-center mt-2 mb-6 leading-relaxed">
              Escolha uma senha com pelo menos 8 caracteres.
            </p>

            <form action={acao} className="space-y-4">
              <div>
                <label
                  htmlFor="senha"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  NOVA SENHA
                </label>
                <input
                  id="senha"
                  name="senha"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E]"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmacao"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  CONFIRMAR SENHA
                </label>
                <input
                  id="confirmacao"
                  name="confirmacao"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E]"
                />
              </div>

              {estado && !estado.ok && (
                <p className="text-sm text-[#B00063]">{estado.erro}</p>
              )}

              <button
                type="submit"
                disabled={pendente}
                className="w-full bg-[#131A2E] text-white rounded-sm py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
              >
                {pendente ? 'SALVANDO...' : 'SALVAR SENHA'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}