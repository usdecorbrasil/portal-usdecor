'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'

/**
 * Baixa manual de recebimento (Financeiro → A receber). A automática pelo
 * Bling continua; aqui o financeiro confirma o que já conferiu. Uma RPC por
 * parcela (ou pelo pedido à vista), que valida tudo de novo no banco.
 */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

export type ItemRecebimento = { pedidoId: string; numeroParcela: number | null; valor: number; numero: number }

const schema = z.object({
  itens: z.array(z.object({ pedidoId: z.string().uuid(), numeroParcela: z.number().int().positive().nullable(), valor: z.number().positive(), numero: z.number() })).min(1, 'Selecione ao menos uma cobrança'),
  recebidoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do recebimento'),
  obs: z.string().trim().max(300).nullable(),
})

const dataBr = (iso: string) => iso.split('-').reverse().join('/')
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function confirmarRecebimentos(
  itens: ItemRecebimento[],
  recebidoEm: string,
  obs: string | null
): Promise<Resultado<{ feitas: number; erros: string[] }>> {
  const perfil = await lerPerfil()
  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) return { ok: false, erro: 'Acesso negado.' }
  const parsed = schema.safeParse({ itens, recebidoEm, obs })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const supabase = await createClient()
  const erros: string[] = []
  let feitas = 0
  for (const it of parsed.data.itens) {
    const { error } = await supabase.rpc('admin_registrar_recebimento', {
      p_pedido_id: it.pedidoId,
      p_numero_parcela: it.numeroParcela,
      p_recebido_em: parsed.data.recebidoEm,
      p_valor: it.numeroParcela == null ? it.valor : null,
      p_obs: parsed.data.obs,
    })
    const rotulo = `#${it.numero}${it.numeroParcela ? ` parcela ${it.numeroParcela}` : ''}`
    if (error) {
      erros.push(`${rotulo}: ${error.message}`)
      continue
    }
    feitas++
    await registrar({
      entidade: 'pedido',
      entidadeId: it.pedidoId,
      acao: 'pagou',
      campos: [{ campo: 'Recebimento', de: null, para: `${rotulo} · R$ ${brl(it.valor)} em ${dataBr(parsed.data.recebidoEm)}` }],
      motivo: parsed.data.obs,
    })
    revalidatePath(`/admin/pedidos/${it.pedidoId}`)
  }
  revalidatePath('/admin/financeiro/a-receber')
  revalidatePath('/admin/financeiro')
  if (!feitas) return { ok: false, erro: erros.join(' · ') }
  return { ok: true, feitas, erros }
}
