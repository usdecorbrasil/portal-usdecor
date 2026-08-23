import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
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