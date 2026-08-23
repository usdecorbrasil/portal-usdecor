import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const erro = searchParams.get('error')

  const cookieStore = await cookies()
  const stateEsperado = cookieStore.get('bling_oauth_state')?.value
  cookieStore.delete('bling_oauth_state')

  if (erro) {
    return NextResponse.redirect(
      new URL(`/admin/configuracoes?bling_erro=${encodeURIComponent(erro)}`, request.url)
    )
  }

  if (!code || !state || state !== stateEsperado) {
    return NextResponse.redirect(
      new URL('/admin/configuracoes?bling_erro=state_invalido', request.url)
    )
  }

  const basicAuth = Buffer.from(
    `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
  ).toString('base64')

  const resposta = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.BLING_REDIRECT_URI!,
    }),
  })

  if (!resposta.ok) {
    const textoErro = await resposta.text()
    console.error('ERRO TROCA DE TOKEN BLING:', textoErro)
    return NextResponse.redirect(
      new URL('/admin/configuracoes?bling_erro=token_falhou', request.url)
    )
  }

  const dados = await resposta.json()

  const expiresAt = new Date(Date.now() + dados.expires_in * 1000).toISOString()

  const admin = createAdminClient()
  await admin.from('integracao_bling').upsert({
    id: true,
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  return NextResponse.redirect(
    new URL('/admin/configuracoes?bling_conectado=1', request.url)
  )
}