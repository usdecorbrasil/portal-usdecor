'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  MAX_PARCELAS,
  normalizar,
  PADRAO,
  type ConfigPagamento,
} from '@/lib/pagamento/config'
import { registrar, type CampoAlterado } from '@/lib/auditoria'
import {
  TIPOS,
  ROTULOS,
  PADRAO as PADRAO_NOTIFICACOES,
  normalizar as normalizarNotificacoes,
  type ConfigNotificacoes,
} from '@/lib/notificacoes/config'

const NOME_FORMA: Record<string, string> = {
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

const NOME_AJUSTE: Record<string, string> = {
  ativa: 'ativa',
  maxParcelas: 'máximo de parcelas',
  valorMinimoParcela: 'valor mínimo por parcela',
  percentual: 'percentual',
  taxaFixa: 'taxa fixa',
  intervaloDias: 'intervalo entre boletos',
}

/**
 * Diferença entre duas configurações de pagamento, em linhas legíveis
 * ("Boleto · máximo de parcelas: 3 → 4").
 *
 * A configuração é um JSON de três formas por seis ajustes; guardar o JSON
 * inteiro no histórico obrigaria quem consulta a comparar os dois na mão.
 */
function diferencasPagamento(
  antes: ConfigPagamento,
  depois: ConfigPagamento
): CampoAlterado[] {
  const mudou: CampoAlterado[] = []

  for (const [forma, nomeForma] of Object.entries(NOME_FORMA)) {
    const a = antes[forma as keyof ConfigPagamento] as Record<string, unknown>
    const d = depois[forma as keyof ConfigPagamento] as Record<string, unknown>
    if (!a || !d) continue

    for (const [ajuste, nomeAjuste] of Object.entries(NOME_AJUSTE)) {
      if (String(a[ajuste]) === String(d[ajuste])) continue
      mudou.push({
        campo: `${nomeForma} · ${nomeAjuste}`,
        de: a[ajuste] === undefined ? null : String(a[ajuste]),
        para: d[ajuste] === undefined ? null : String(d[ajuste]),
      })
    }
  }

  return mudou
}

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && (perfil.role === 'admin' || perfil.role === 'financeiro')
}

export async function buscarValorMinimoBoleto(): Promise<number> {
  return (await buscarConfigPagamento()).boleto.valorMinimoParcela
}


export async function buscarMaxParcelas(): Promise<number> {
  return (await buscarConfigPagamento()).boleto.maxParcelas
}

/* ------------------------- formas de pagamento ------------------------- */

/**
 * Todas as regras de pagamento vivem numa chave só, em JSON. São cinco
 * ajustes por forma; em linhas chave/valor separadas, cada leitura da tela
 * viraria uma consulta diferente.
 */
export async function buscarConfigPagamento(): Promise<ConfigPagamento> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'formas_pagamento')
    .maybeSingle()

  if (!data?.valor) return PADRAO

  try {
    return normalizar(JSON.parse(data.valor))
  } catch {
    // JSON corrompido não pode derrubar o carrinho
    return PADRAO
  }
}

const schemaForma = z.object({
  ativa: z.boolean(),
  maxParcelas: z.number().int().min(1, 'Mínimo de 1 parcela')
    .max(MAX_PARCELAS, `Máximo de ${MAX_PARCELAS} parcelas`),
  valorMinimoParcela: z.number().min(0, 'Não pode ser negativo').max(100000),
  percentual: z.number().min(0, 'Não pode ser negativo').max(100, 'Máximo de 100%'),
  taxaFixa: z.number().min(0, 'Não pode ser negativo').max(10000),
  intervaloDias: z.number().int().min(1).max(90),
})

export async function atualizarConfigPagamento(
  nova: ConfigPagamento
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({
      boleto: schemaForma,
      cartao_credito: schemaForma,
      cartao_debito: schemaForma,
    })
    .safeParse(nova)

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  if (!Object.values(parsed.data).some((f) => f.ativa)) {
    return { ok: false, erro: 'Deixe ao menos uma forma de pagamento ativa.' }
  }

  // Lida antes de gravar: é o que vira a linha de auditoria
  const antes = await buscarConfigPagamento()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // `update`, não `upsert`: a RLS de `configuracoes` permite atualizar, mas
  // não inserir. A linha é criada pela migração (docs/sql/003).
  const { error, count } = await supabase
    .from('configuracoes')
    .update(
      {
        valor: JSON.stringify(normalizar(parsed.data)),
        atualizado_em: new Date().toISOString(),
        atualizado_por: user?.id,
      },
      { count: 'exact' }
    )
    .eq('chave', 'formas_pagamento')

  if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message }

  if (!count) {
    return {
      ok: false,
      erro:
        'A configuração de pagamento ainda não existe no banco. ' +
        'Rode docs/sql/003-semear-formas-pagamento.sql no Supabase.',
    }
  }

  // Ponte: `parcelar_pedido` no Postgres ainda valida por estas duas chaves.
  // Enquanto a migração da taxa não roda, elas precisam refletir o boleto,
  // senão a tela permite 6x e o banco recusa na hora de parcelar.
  for (const [chave, valor] of [
    ['max_parcelas', String(parsed.data.boleto.maxParcelas)],
    ['valor_minimo_boleto', parsed.data.boleto.valorMinimoParcela.toFixed(2)],
  ]) {
    await supabase
      .from('configuracoes')
      .update({
        valor,
        atualizado_em: new Date().toISOString(),
        atualizado_por: user?.id,
      })
      .eq('chave', chave)
  }


  await registrar({
    entidade: 'configuracao',
    entidadeId: null,
    acao: 'editou',
    campos: diferencasPagamento(antes, normalizar(parsed.data)),
  })

  revalidatePath('/admin/configuracoes')
  revalidatePath('/carrinho')
  return { ok: true }
}

/* --------------------------- avisos para a equipe --------------------------- */

export async function buscarConfigNotificacoes(): Promise<ConfigNotificacoes> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'notificacoes')
    .maybeSingle()

  if (!data?.valor) return PADRAO_NOTIFICACOES

  try {
    return normalizarNotificacoes(JSON.parse(data.valor))
  } catch {
    return PADRAO_NOTIFICACOES
  }
}

export async function atualizarConfigNotificacoes(
  nova: ConfigNotificacoes
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object(
      Object.fromEntries(
        TIPOS.map((tipo) => [tipo, z.array(z.string().email()).max(20)])
      ) as Record<(typeof TIPOS)[number], z.ZodArray<z.ZodString>>
    )
    .safeParse(nova)

  if (!parsed.success) {
    return { ok: false, erro: 'Há um e-mail inválido na lista.' }
  }

  const limpa = normalizarNotificacoes(parsed.data)
  const antes = await buscarConfigNotificacoes()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error, count } = await supabase
    .from('configuracoes')
    .update(
      {
        valor: JSON.stringify(limpa),
        atualizado_em: new Date().toISOString(),
        atualizado_por: user?.id,
      },
      { count: 'exact' }
    )
    .eq('chave', 'notificacoes')

  if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message }

  if (!count) {
    return {
      ok: false,
      erro:
        'A configuração de avisos ainda não existe no banco. ' +
        'Rode docs/sql/014-config-notificacoes.sql no Supabase.',
    }
  }

  // Cada tipo vira uma linha na auditoria, com a lista antes e depois
  const campos: CampoAlterado[] = []
  for (const tipo of TIPOS) {
    const de = antes[tipo].join(', ')
    const para = limpa[tipo].join(', ')
    if (de !== para) {
      campos.push({ campo: `Aviso · ${ROTULOS[tipo].titulo}`, de: de || null, para: para || null })
    }
  }

  await registrar({
    entidade: 'configuracao',
    entidadeId: null,
    acao: 'editou',
    campos,
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}
