'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import { UNIDADES } from '@/lib/suprimentos/unidades'

/**
 * Estoque de suprimentos da estamparia (tinta, papel, embalagem…).
 * Cadastro é do dono; consumo e ajuste a equipe inteira lança; entrada vem
 * da nota de compra (Despesas). Saldo é a soma dos movimentos (view
 * `suprimento_saldos`), nunca editado à mão.
 */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }


async function exigirDono() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro')
}
async function exigirEquipe() {
  const perfil = await lerPerfil()
  return !!perfil && perfil.papel !== 'cliente'
}
function revalidar() {
  revalidatePath('/admin/estoque/suprimentos')
  revalidatePath('/admin/estoque/despesas')
}

const schemaSuprimento = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120),
  unidade: z.enum(UNIDADES),
  categoriaId: z.string().uuid().nullable().optional(),
  minimo: z.number().min(0).default(0),
  consumoPorMetro: z.number().min(0).nullable().optional(),
})

export async function criarSuprimento(dados: z.input<typeof schemaSuprimento>): Promise<Resultado<{ id: string }>> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = schemaSuprimento.safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('suprimentos')
    .insert({
      nome: d.nome,
      unidade: d.unidade,
      categoria_id: d.categoriaId ?? null,
      minimo: d.minimo,
      consumo_por_metro: d.consumoPorMetro || null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe um suprimento com esse nome.' : error.message }
  await registrar({ entidade: 'suprimento', entidadeId: data.id, acao: 'criou', campos: [{ campo: 'Nome', de: null, para: d.nome }] })
  revalidar()
  return { ok: true, id: data.id }
}

export async function editarSuprimento(id: string, dados: z.input<typeof schemaSuprimento> & { ativo?: boolean }): Promise<Resultado> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = schemaSuprimento.extend({ ativo: z.boolean().optional() }).safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { data: antes } = await supabase.from('suprimentos').select('nome, unidade, minimo, consumo_por_metro, ativo').eq('id', id).maybeSingle()
  const { error } = await supabase
    .from('suprimentos')
    .update({
      nome: d.nome,
      unidade: d.unidade,
      categoria_id: d.categoriaId ?? null,
      minimo: d.minimo,
      consumo_por_metro: d.consumoPorMetro || null,
      ...(d.ativo !== undefined ? { ativo: d.ativo } : {}),
    })
    .eq('id', id)
  if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe um suprimento com esse nome.' : error.message }

  const campos: { campo: string; de: string | null; para: string | null }[] = []
  if (antes) {
    if (antes.nome !== d.nome) campos.push({ campo: 'Nome', de: antes.nome, para: d.nome })
    if (antes.unidade !== d.unidade) campos.push({ campo: 'Unidade', de: antes.unidade, para: d.unidade })
    if (Number(antes.minimo) !== d.minimo) campos.push({ campo: 'Mínimo', de: String(antes.minimo), para: String(d.minimo) })
    if ((antes.consumo_por_metro ?? null) !== (d.consumoPorMetro || null))
      campos.push({ campo: 'Consumo por metro', de: antes.consumo_por_metro != null ? String(antes.consumo_por_metro) : null, para: d.consumoPorMetro ? String(d.consumoPorMetro) : null })
    if (d.ativo !== undefined && antes.ativo !== d.ativo) campos.push({ campo: 'Ativo', de: String(antes.ativo), para: String(d.ativo) })
  }
  if (campos.length) await registrar({ entidade: 'suprimento', entidadeId: id, acao: 'editou', campos })
  revalidar()
  return { ok: true }
}

export async function movimentarSuprimento(dados: {
  suprimentoId: string
  tipo: 'consumo' | 'ajuste' | 'entrada'
  quantidade: number
  observacao?: string
}): Promise<Resultado> {
  if (!(await exigirEquipe())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = z
    .object({
      suprimentoId: z.string().uuid(),
      tipo: z.enum(['consumo', 'ajuste', 'entrada']),
      quantidade: z.number().finite().max(1_000_000),
      observacao: z.string().trim().max(300).optional(),
    })
    .refine((d) => (d.tipo === 'ajuste' ? d.quantidade !== 0 : d.quantidade > 0), { message: 'Informe a quantidade', path: ['quantidade'] })
    .safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('registrar_movimento_suprimento', {
    p_suprimento_id: parsed.data.suprimentoId,
    p_tipo: parsed.data.tipo,
    p_quantidade: parsed.data.quantidade,
    p_observacao: parsed.data.observacao || null,
  })
  if (error) return { ok: false, erro: error.message }
  revalidar()
  return { ok: true }
}
