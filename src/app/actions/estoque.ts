'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import { registrar } from '@/lib/auditoria'
import { TIPOS_MOVIMENTO, type TipoMovimento } from '@/lib/estoque/tipos'

/**
 * Estoque de tecido do cliente.
 *
 * O cadastro de tecidos é do dono. As movimentações são da equipe inteira
 * (produção recebe e mede o tecido) e passam pela RPC, que grava o autor e
 * valida o portão. O saldo nunca é editado: é a soma dos movimentos.
 */

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirDono() {
  const perfil = await lerPerfil()
  return !!perfil && (perfil.papel === 'admin' || perfil.papel === 'financeiro')
}

async function exigirEquipe() {
  const perfil = await lerPerfil()
  return !!perfil && perfil.papel !== 'cliente'
}

function revalidar() {
  revalidatePath('/admin/estoque')
}

/* --------------------------------- tecidos --------------------------------- */

export async function criarTecido(nome: string): Promise<Resultado> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().trim().min(2, 'Nome muito curto').max(80).safeParse(nome)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tecidos')
    .insert({ nome: parsed.data })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Já existe um tecido com este nome.' }
    return { ok: false, erro: 'Não foi possível cadastrar o tecido.' }
  }

  await registrar({
    entidade: 'configuracao',
    entidadeId: data.id,
    acao: 'criou',
    campos: [{ campo: 'Tecido', de: null, para: parsed.data }],
  })

  revalidar()
  return { ok: true }
}

export async function renomearTecido(id: string, nome: string): Promise<Resultado> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({ id: z.string().uuid(), nome: z.string().trim().min(2, 'Nome muito curto').max(80) })
    .safeParse({ id, nome })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const admin = createAdminClient()
  const { data: antes } = await admin.from('tecidos').select('nome').eq('id', parsed.data.id).maybeSingle()
  if (!antes) return { ok: false, erro: 'Tecido não encontrado.' }
  if (antes.nome === parsed.data.nome) return { ok: true }

  const { error } = await admin.from('tecidos').update({ nome: parsed.data.nome }).eq('id', parsed.data.id)
  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Já existe um tecido com este nome.' }
    return { ok: false, erro: 'Não foi possível renomear.' }
  }

  await registrar({
    entidade: 'configuracao',
    entidadeId: parsed.data.id,
    acao: 'editou',
    campos: [{ campo: 'Tecido', de: antes.nome, para: parsed.data.nome }],
  })

  revalidar()
  return { ok: true }
}

/** Tecido nunca é excluído (há movimentos apontando para ele): só sai da lista. */
export async function alternarTecido(id: string, ativo: boolean): Promise<Resultado> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { ok: false, erro: 'Tecido inválido.' }

  const admin = createAdminClient()
  const { data: tecido, error } = await admin
    .from('tecidos')
    .update({ ativo })
    .eq('id', parsed.data)
    .select('nome')
    .single()
  if (error || !tecido) return { ok: false, erro: 'Não foi possível alterar o tecido.' }

  await registrar({
    entidade: 'configuracao',
    entidadeId: parsed.data,
    acao: ativo ? 'ativou' : 'desativou',
    campos: [{ campo: 'Tecido', de: tecido.nome, para: tecido.nome }],
  })

  revalidar()
  return { ok: true }
}

/* ------------------------------- movimentos ------------------------------- */

export async function registrarMovimento(dados: {
  clienteId: string
  tecidoId: string
  tipo: TipoMovimento
  metros: number
  observacao?: string
  pedidoId?: string | null
}): Promise<Resultado> {
  if (!(await exigirEquipe())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({
      clienteId: z.string().uuid(),
      tecidoId: z.string().uuid(),
      tipo: z.enum(TIPOS_MOVIMENTO),
      metros: z.number().finite().max(1000000),
      observacao: z.string().trim().max(500).optional(),
      pedidoId: z.string().uuid().nullable().optional(),
    })
    .refine((d) => (d.tipo === 'ajuste' ? d.metros !== 0 : d.metros > 0), {
      message: 'Informe a metragem',
      path: ['metros'],
    })
    .safeParse(dados)
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('registrar_movimento_tecido', {
    p_cliente_id: parsed.data.clienteId,
    p_tecido_id: parsed.data.tecidoId,
    p_tipo: parsed.data.tipo,
    p_metros: parsed.data.metros,
    p_observacao: parsed.data.observacao || null,
    p_pedido_id: parsed.data.pedidoId ?? null,
  })
  if (error) return { ok: false, erro: error.message }

  revalidar()
  return { ok: true }
}

/* ------------------------------ pedido × tecido ------------------------------ */

export type SaldoTecido = { tecidoId: string; nome: string; saldo: number }

/** Tecidos ativos com saldo do cliente, para a escolha no romaneio. */
export async function saldosDoCliente(clienteId: string): Promise<SaldoTecido[]> {
  if (!(await exigirEquipe())) return []
  const parsed = z.string().uuid().safeParse(clienteId)
  if (!parsed.success) return []

  const supabase = await createClient()
  const [{ data: saldos }, { data: tecidos }] = await Promise.all([
    supabase.from('tecido_saldos').select('tecido_id, saldo_metros').eq('cliente_id', parsed.data),
    supabase.from('tecidos').select('id, nome').eq('ativo', true).order('nome'),
  ])

  const porTecido = new Map(((saldos ?? []) as { tecido_id: string; saldo_metros: number }[]).map((s) => [s.tecido_id, Number(s.saldo_metros)]))
  return ((tecidos ?? []) as { id: string; nome: string }[])
    .map((t) => ({ tecidoId: t.id, nome: t.nome, saldo: porTecido.get(t.id) ?? 0 }))
    .filter((t) => t.saldo > 0)
}

/**
 * Escolhe o tecido do pedido antes do romaneio. O banco confere que o saldo
 * cobre a metragem e recusa com mensagem legível; a baixa em si acontece por
 * gatilho quando a metragem impressa é gravada.
 */
export async function definirTecidoPedido(
  pedidoId: string,
  tecidoId: string,
  metragem: number
): Promise<Resultado> {
  if (!(await exigirEquipe())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({ pedidoId: z.string().uuid(), tecidoId: z.string().uuid(), metragem: z.number().positive() })
    .safeParse({ pedidoId, tecidoId, metragem })
  if (!parsed.success) return { ok: false, erro: 'Escolha o tecido e informe a metragem.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('definir_tecido_pedido', {
    p_pedido_id: parsed.data.pedidoId,
    p_tecido_id: parsed.data.tecidoId,
    p_metragem: parsed.data.metragem,
  })
  if (error) return { ok: false, erro: error.message }

  revalidar()
  revalidatePath(`/admin/pedidos/${parsed.data.pedidoId}`)
  return { ok: true }
}
