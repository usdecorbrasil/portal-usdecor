'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar, diferencas } from '@/lib/auditoria'
import type { CartaoCredito } from '@/lib/contas-pagar/cartoes'

/**
 * Cartões de crédito da empresa (Configurações → Pagamento). Só admin/financeiro.
 * Dia de fechamento e de vencimento definem em que fatura cai cada compra —
 * a regra está em `src/lib/contas-pagar/cartoes.ts`.
 */

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

async function exigirDono() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro')
}

function revalidar() {
  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/financeiro/a-pagar')
  revalidatePath('/admin/estoque/despesas/nova')
}

const dia = (rotulo: string) => z.coerce.number().int().min(1, `${rotulo}: de 1 a 31`).max(31, `${rotulo}: de 1 a 31`)
const schemaCartao = z.object({
  nome: z.string().trim().min(2, 'Dê um nome ao cartão (ex.: Nubank, Itaú PJ)').max(60),
  final: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => s === '' || s.length === 4, 'Final do cartão: os 4 últimos dígitos')
    .transform((s) => s || null),
  diaFechamento: dia('Dia de fechamento'),
  diaVencimento: dia('Dia de vencimento'),
})

type LinhaBanco = { id: string; nome: string; final: string | null; dia_fechamento: number; dia_vencimento: number; ativo: boolean }
const paraCartao = (c: LinhaBanco): CartaoCredito => ({
  id: c.id,
  nome: c.nome,
  final: c.final,
  diaFechamento: c.dia_fechamento,
  diaVencimento: c.dia_vencimento,
  ativo: c.ativo,
})

const ROTULOS = { nome: 'Nome', final: 'Final', dia_fechamento: 'Dia de fechamento', dia_vencimento: 'Dia de vencimento' }

export async function listarCartoes(somenteAtivos = false): Promise<CartaoCredito[]> {
  if (!(await exigirDono())) return []
  const supabase = await createClient()
  let q = supabase.from('cartoes_credito').select('id, nome, final, dia_fechamento, dia_vencimento, ativo').order('ativo', { ascending: false }).order('nome')
  if (somenteAtivos) q = q.eq('ativo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as LinhaBanco[]).map(paraCartao)
}

export async function criarCartao(dados: z.input<typeof schemaCartao>): Promise<Resultado<{ id: string }>> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = schemaCartao.safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cartoes_credito')
    .insert({ nome: d.nome, final: d.final, dia_fechamento: d.diaFechamento, dia_vencimento: d.diaVencimento })
    .select('id')
    .single()
  if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe um cartão ativo com esse nome.' : error.message }
  await registrar({
    entidade: 'cartao_credito',
    entidadeId: data.id,
    acao: 'criou',
    campos: [
      { campo: 'Nome', de: null, para: d.final ? `${d.nome} · final ${d.final}` : d.nome },
      { campo: 'Fatura', de: null, para: `fecha dia ${d.diaFechamento}, vence dia ${d.diaVencimento}` },
    ],
  })
  revalidar()
  return { ok: true, id: data.id }
}

export async function editarCartao(id: string, dados: z.input<typeof schemaCartao>): Promise<Resultado> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }
  const parsed = schemaCartao.safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { data: antes } = await supabase.from('cartoes_credito').select('nome, final, dia_fechamento, dia_vencimento').eq('id', id).maybeSingle()
  if (!antes) return { ok: false, erro: 'Cartão não encontrado.' }
  const depois = { nome: d.nome, final: d.final, dia_fechamento: d.diaFechamento, dia_vencimento: d.diaVencimento }
  const { error } = await supabase.from('cartoes_credito').update(depois).eq('id', id)
  if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe um cartão ativo com esse nome.' : error.message }
  await registrar({ entidade: 'cartao_credito', entidadeId: id, acao: 'editou', campos: diferencas(antes, depois, ROTULOS) })
  revalidar()
  return { ok: true }
}

export async function ativarCartao(id: string, ativo: boolean): Promise<Resultado> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }
  const supabase = await createClient()
  const { error } = await supabase.from('cartoes_credito').update({ ativo }).eq('id', id)
  if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe um cartão ativo com esse nome.' : error.message }
  await registrar({ entidade: 'cartao_credito', entidadeId: id, acao: ativo ? 'ativou' : 'desativou', campos: [] })
  revalidar()
  return { ok: true }
}
