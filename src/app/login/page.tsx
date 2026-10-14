'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { OlhoAberto, OlhoFechado } from '@/components/campo-senha'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()
  const params = useSearchParams()

  const avisoLink =
    params.get('erro') === 'link_expirado'
      ? 'O link expirou. Peça um novo abaixo.'
      : params.get('erro') === 'link_invalido'
      ? 'Link inválido. Peça um novo abaixo.'
      : ''

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })

    if (error) {
      // Mensagem genérica: não revela se o e-mail existe.
      setErro('E-mail ou senha incorretos.')
      setCarregando(false)
      return
    }

    router.refresh()
    router.push('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F2F1ED] px-5">
      <div className="w-full max-w-sm">
        <Image
          src="/logo-horizontal.png"
          alt="US Decor"
          width={483}
          height={120}
          priority
          className="h-14 w-auto mx-auto -translate-x-2"
        />
        <p className="text-sm text-[#6E6E68] mt-4 mb-8 text-center">
          Portal interno
        </p>

        {avisoLink && (
          <p className="text-sm text-[#C79600] bg-[#FBF0D9] border border-[#E8C36B] rounded-sm p-3 mb-4">
            {avisoLink}
          </p>
        )}

        <form onSubmit={entrar} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              E-MAIL
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E]"
            />
          </div>

          <div>
            <label
              htmlFor="senha"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              SENHA
            </label>
            <div className="relative">
              <input
                id="senha"
                type={verSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-[#DDDCD5] rounded-sm pl-3 pr-12 py-2.5 bg-white outline-none focus:border-[#131A2E]"
              />
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={verSenha}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-[#6E6E68] hover:text-[#131A2E]"
              >
                {verSenha ? <OlhoFechado /> : <OlhoAberto />}
              </button>
            </div>
          </div>

          {erro && <p className="text-sm text-[#B00063]">{erro}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-[#131A2E] text-white rounded-sm py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {carregando ? 'ENTRANDO...' : 'ENTRAR'}
          </button>
        </form>

        <p className="text-center mt-4">
          <Link
            href="/esqueci-senha"
            className="text-sm text-[#B00063] hover:underline"
          >
            Esqueci minha senha
          </Link>
        </p>

        <p className="text-xs text-[#6E6E68] mt-6 leading-relaxed text-center">
          Acesso só para a equipe da US Decor. Se você ainda não tem login, peça
          ao administrador do portal.
        </p>
      </div>
    </main>
  )
}