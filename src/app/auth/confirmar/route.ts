import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const { data: verificado, error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link_expirado`)
  }

  // Link de redefinição: libera a troca de senha sem a atual por 30 minutos.
  // A marca fica em app_metadata (só a chave de serviço escreve), então quem
  // só tem uma sessão aberta — sem ter passado pelo link do e-mail — não
  // consegue trocar a senha por `definirNovaSenha`.
  if (type === 'recovery') {
    const user = verificado.user
    if (user) {
      await createAdminClient().auth.admin.updateUserById(user.id, {
        app_metadata: { redefinicao_senha_ate: Date.now() + 30 * 60 * 1000 },
      })
    }
  }

  return NextResponse.redirect(`${origin}${destino}`)
}