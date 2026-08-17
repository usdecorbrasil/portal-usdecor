import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente Supabase para uso no NAVEGADOR.
 * Usa a chave publicável — todo acesso é filtrado pelas
 * políticas de segurança do banco. Sozinha, ela não abre nada.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}