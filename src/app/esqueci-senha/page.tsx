'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { pedirRecuperacao } from '@/app/actions/senha'

export default function EsqueciSenhaPage() {
  const [estado, acao, pendente] = useActionState(pedirRecuperacao, null)

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F2F1ED] px-5">
      <div className="w-full max-w-sm">
        <Image
          src="/logo.png"
          alt="US Decor"
          width={600}
          height={600}
          priority
          className="h-28 w-auto mx-auto"
        />

        <h1 className="text-lg font-semibold tracking-tight text-center mt-6">
          Recuperar acesso
        </h1>

        {estado?.ok ? (
          <div className="mt-6 bg-white border border-[#DDDCD5] rounded-sm p-5 text-center">
            <p className="text-sm text-[#131A2E] leading-relaxed">
              Se este e-mail estiver cadastrado, você receberá um link para
              definir uma nova senha.
            </p>
            <p className="text-xs text-[#6E6E68] mt-3 leading-relaxed">
              Confira a caixa de entrada e o spam. O link vale por 1 hora.
            </p>
            <Link
              href="/login"
              className="inline-block mt-5 text-sm text-[#B00063] hover:underline"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#6E6E68] text-center mt-2 mb-6 leading-relaxed">
              Informe o e-mail cadastrado e enviaremos um link para você criar
              uma nova senha.
            </p>

            <form action={acao} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
                >
                  E-MAIL
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
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
                {pendente ? 'ENVIANDO...' : 'ENVIAR LINK'}
              </button>
            </form>

            <p className="text-center mt-6">
              <Link
                href="/login"
                className="text-sm text-[#6E6E68] hover:text-[#131A2E]"
              >
                Voltar ao login
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}