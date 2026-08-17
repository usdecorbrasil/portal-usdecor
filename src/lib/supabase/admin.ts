import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * ⚠️ ATENÇÃO — ACESSO TOTAL AO BANCO
 *
 * Este cliente IGNORA todas as políticas de segurança.
 * Ele enxerga todos os clientes, todos os pedidos, todos os preços.
 *
 * Use SOMENTE em:
 *   - Server Actions do painel administrativo
 *   - Rotas de API do servidor (sincronização com o Bling)
 *
 * NUNCA importe este arquivo em componente que rode no navegador.
 * A linha 'server-only' acima quebra o build caso isso aconteça.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}