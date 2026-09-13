'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { definirPrimeiraSenha } from '@/app/actions/senha'
import CampoSenha from '@/components/campo-senha'

/**
 * Primeiro acesso. Quem entrou com a senha do convite passa por aqui antes de
 * qualquer outra tela — vale para equipe e para cliente, porque a senha do
 * e-mail não é de ninguém enquanto estiver na caixa de entrada.
 *
 * Não tem link para sair nem para voltar: o proxy traz de volta para cá
 * enquanto a senha for a provisória, e oferecer uma saída que não existe só
 * confundiria.
 */
export default function PrimeiroAcessoPage() {
  const [estado, acao, pendente] = useActionState(definirPrimeiraSenha, null)
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
          alt="Best Color Tecidos"
          width={483}
          height={120}
          priority
          className="h-14 w-auto mx-auto -translate-x-2"
        />

        {estado?.ok ? (
          <div className="mt-6 bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm p-5 text-center">
            <p className="text-sm font-semibold text-[#2E7D4F]">Senha criada</p>
            <p className="text-xs text-[#131A2E] mt-2">Entrando no portal...</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-center mt-6">
              Crie sua senha
            </h1>

            <p className="text-sm text-[#6E6E68] text-center mt-2 mb-6 leading-relaxed">
              Este é seu primeiro acesso. Escolha uma senha só sua, com pelo
              menos 8 caracteres — a que veio no e-mail deixa de valer.
            </p>

            <form action={acao} className="space-y-4">
              <CampoSenha
                id="senha"
                name="senha"
                rotulo="NOVA SENHA"
                autoFocus
              />

              <CampoSenha
                id="confirmacao"
                name="confirmacao"
                rotulo="CONFIRMAR SENHA"
              />

              {estado && !estado.ok && (
                <p className="text-sm text-[#B00063]">{estado.erro}</p>
              )}

              <button
                type="submit"
                disabled={pendente}
                className="w-full bg-[#131A2E] text-white rounded-sm py-3 text-sm font-semibold tracking-wide disabled:opacity-50"
              >
                {pendente ? 'SALVANDO...' : 'CRIAR SENHA E ENTRAR'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
