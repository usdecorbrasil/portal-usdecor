import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

const BASE = 'https://www.bling.com.br/Api/v3'

/** Renova alguns minutos antes de expirar, para não estourar no meio de uma chamada */
const MARGEM_MS = 5 * 60 * 1000

export type EstadoBling = {
  conectado: boolean
  expiraEm: string | null
  atualizadoEm: string | null
  expirado: boolean
}

export async function lerEstadoBling(): Promise<EstadoBling> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('integracao_bling')
    .select('access_token, expires_at, updated_at')
    .maybeSingle()

  if (!data?.access_token) {
    return {
      conectado: false,
      expiraEm: null,
      atualizadoEm: null,
      expirado: false,
    }
  }

  return {
    conectado: true,
    expiraEm: data.expires_at,
    atualizadoEm: data.updated_at,
    expirado: new Date(data.expires_at).getTime() < Date.now(),
  }
}

/**
 * Devolve um access token válido, renovando pelo refresh token quando
 * necessário. O token do Bling dura poucas horas, então quase toda
 * chamada real passa por aqui.
 */
async function tokenValido(): Promise<string | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('integracao_bling')
    .select('access_token, refresh_token, expires_at')
    .maybeSingle()

  if (!data?.access_token) return null

  const aindaVale =
    new Date(data.expires_at).getTime() - MARGEM_MS > Date.now()

  if (aindaVale) return data.access_token

  if (!data.refresh_token) return null

  const basicAuth = Buffer.from(
    `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
  ).toString('base64')

  const resposta = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
    }),
  })

  if (!resposta.ok) return null

  const novo = await resposta.json()

  await admin.from('integracao_bling').upsert({
    id: true,
    access_token: novo.access_token,
    refresh_token: novo.refresh_token ?? data.refresh_token,
    expires_at: new Date(Date.now() + novo.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })

  return novo.access_token
}

export type RespostaBling =
  | { ok: true; status: number; dados: unknown }
  | { ok: false; status: number; erro: string }

/** Chamada autenticada à API do Bling */
export async function chamarBling(
  caminho: string,
  opcoes: RequestInit = {}
): Promise<RespostaBling> {
  const token = await tokenValido()

  if (!token) {
    return {
      ok: false,
      status: 401,
      erro: 'Bling não conectado ou token expirado sem renovação possível.',
    }
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opcoes.headers ?? {}),
    },
  })

  const texto = await resposta.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }

  if (!resposta.ok) {
    return {
      ok: false,
      status: resposta.status,
      erro:
        typeof dados === 'object' && dados !== null
          ? JSON.stringify(dados)
          : String(dados ?? resposta.statusText),
    }
  }

  return { ok: true, status: resposta.status, dados }
}
