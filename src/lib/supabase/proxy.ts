import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Rotas acessíveis sem login. Todo o resto exige sessão válida. */
const ROTAS_PUBLICAS = [
  '/login',
  '/esqueci-senha',
  '/nova-senha',
  '/auth',
]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Não remover: revalida o token no servidor a cada requisição.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const ehPublica = ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))

  // Sem sessão em rota protegida: manda para o login.
  if (!user && !ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Senha ainda é a provisória do convite: nada do portal abre antes de a
  // pessoa criar a própria senha. A marca vem em `app_metadata`, que já chega
  // junto com o usuário — checar isso numa tabela custaria uma consulta a mais
  // em toda requisição do site.
  const senhaProvisoria = user?.app_metadata?.senha_provisoria === true
  const naTelaDeSenha = pathname.startsWith('/primeiro-acesso')

  // `/api` fica de fora: redirecionar uma chamada de dados devolveria HTML
  // onde o cliente espera JSON. Quem está nesse estado não passa das telas.
  if (
    senhaProvisoria &&
    !naTelaDeSenha &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/api')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/primeiro-acesso'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Já criou a senha e tenta voltar para a tela do primeiro acesso: não há
  // mais o que fazer ali.
  //
  // O `!senhaProvisoria` é o que impede o laço: sem ele, quem ainda precisa da
  // tela era mandado para a raiz, que mandava de volta para cá, sem fim.
  if (user && !senhaProvisoria && naTelaDeSenha) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Já logado tentando abrir o login: manda para a raiz,
  // que decide o destino conforme o papel do usuário.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}