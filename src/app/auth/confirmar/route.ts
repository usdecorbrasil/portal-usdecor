import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Recebe o retorno dos links enviados por e-mail
 * (recuperação de senha e convite de primeiro acesso).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  // Só aceita caminhos internos: evita redirecionar para site externo
  const destino = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link_expirado`)
  }

  return NextResponse.redirect(`${origin}${destino}`)
}