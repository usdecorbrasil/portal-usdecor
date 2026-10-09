import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { lerPerfil } from '@/lib/auth/perfil'

/**
 * Início do OAuth do Bling. Só admin/financeiro: quem conecta decide para qual
 * conta do Bling vão pedidos, contatos, notas e cobranças da empresa. Sem esta
 * trava, qualquer usuário logado (inclusive cliente) poderia trocar o token.
 */
export async function GET(request: NextRequest) {
  const perfil = await lerPerfil()
  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const state = crypto.randomUUID()

  const cookieStore = await cookies()
  cookieStore.set('bling_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })

  const url = new URL('https://www.bling.com.br/Api/v3/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', process.env.BLING_CLIENT_ID!)
  url.searchParams.set('state', state)

  return NextResponse.redirect(url.toString())
}