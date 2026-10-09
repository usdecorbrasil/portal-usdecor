'use server'

import { lerPerfil } from '@/lib/auth/perfil'
import { testarChaveIa } from '@/lib/despesas/ler-documento'

/** Botão "Testar leitura por IA" de Configurações — só admin/financeiro. */
export async function testarLeituraIa(): Promise<{ ok: true; detalhe: string } | { ok: false; erro: string }> {
  const perfil = await lerPerfil()
  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) return { ok: false, erro: 'Acesso negado.' }
  return testarChaveIa()
}
