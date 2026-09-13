'use client'

import { useState } from 'react'

/**
 * Campo de senha com botão de ver o que foi digitado.
 *
 * Existe porque senha nova é digitada às cegas e duas vezes: sem poder
 * conferir, o erro mais comum ("as senhas não coincidem") só aparece depois de
 * enviar, e a pessoa recomeça sem saber onde errou.
 *
 * O estado é por campo, não compartilhado: quem revela a senha para conferir um
 * caractere não expõe a confirmação junto.
 */
export default function CampoSenha({
  id,
  name,
  rotulo,
  autoFocus = false,
  minLength = 8,
}: {
  id: string
  name: string
  rotulo: string
  autoFocus?: boolean
  minLength?: number
}) {
  const [visivel, setVisivel] = useState(false)

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
      >
        {rotulo}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visivel ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete="new-password"
          autoFocus={autoFocus}
          className="w-full border border-[#DDDCD5] rounded-sm pl-3 pr-12 py-2.5 bg-white outline-none focus:border-[#131A2E]"
        />

        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-[#6E6E68] hover:text-[#131A2E]"
        >
          {visivel ? <OlhoFechado /> : <OlhoAberto />}
        </button>
      </div>
    </div>
  )
}

/* Ícones inline: são dois traços, não vale uma biblioteca por eles */

function OlhoAberto() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function OlhoFechado() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </svg>
  )
}
