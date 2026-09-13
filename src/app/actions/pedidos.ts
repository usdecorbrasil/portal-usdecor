'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { MAX_PARCELAS } from '@/lib/pagamento/config'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateInterno } from '@/lib/resend/templates/interno'
import { urlDoSite } from '@/lib/site'

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

const schema = z.object({
  itens: z.array(
    z.object({
      produto_id: z.string().uuid(),
      quantidade: z.number().int().min(1).max(100000),
    })
  ).min(1, 'O pedido precisa ter ao menos um item')
   .max(200, 'Máximo de 200 itens por pedido'),
  notas: z.string().trim().max(2000).optional(),
  forma_pagamento: z.enum([
    'boleto_avista',
    'boleto_parcelado',
    'pix',
    'cartao_credito',
    'cartao_debito',
  ])
    .default('boleto_avista'),
  parcelas: z.number().int().min(2).max(MAX_PARCELAS).optional(),
}).refine(
  (d) => d.forma_pagamento !== 'boleto_parcelado' || d.parcelas !== undefined,
  { message: 'Escolha a quantidade de parcelas', path: ['parcelas'] }
).refine(
  (d) =>
    d.forma_pagamento === 'boleto_parcelado' ||
    d.forma_pagamento === 'cartao_credito' ||
    d.parcelas === undefined,
  {
    message: 'Esta forma de pagamento não aceita parcelamento',
    path: ['parcelas'],
  }
)

type Resultado =
  | { ok: true; numero: number; total: number }
  | { ok: false; erro: string }

export async function criarPedido(dados: {
  itens: { produto_id: string; quantidade: number }[]
  notas?: string
  forma_pagamento?: string
  parcelas?: number
}): Promise<Resultado> {
  const parsed = schema.safeParse(dados)

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  // Toda a validação real acontece dentro da função do banco:
  // preço, catálogo do cliente, produto ativo, anti-duplicidade, limite de crédito.
  const { data, error } = await supabase.rpc('criar_pedido', {
    p_itens: parsed.data.itens,
    p_notas: parsed.data.notas || null,
    p_forma_pagamento: parsed.data.forma_pagamento,
    p_parcelas: parsed.data.parcelas ?? null,
  })

  if (error) {
    return { ok: false, erro: error.message }
  }

  const pedido = Array.isArray(data) ? data[0] : data

  if (!pedido) {
    return { ok: false, erro: 'Não foi possível registrar o pedido.' }
  }

  // Aviso para a equipe. Depois do pedido existir, e sem poder derrubá-lo:
  // quem lista os destinatários é Configurações → Avisos
  await avisarPedidoNovo(pedido.pedido_id as string)

  revalidatePath('/pedidos')
  revalidatePath('/admin')

  return {
    ok: true,
    numero: Number(pedido.numero),
    total: Number(pedido.total),
  }
}

async function avisarPedidoNovo(pedidoId: string) {
  try {
    const supabase = await createClient()

    // Um literal só: concatenar quebra a inferência de tipos do select
    const { data: p } = await supabase
      .from('pedidos')
      .select('numero, notas, forma_pagamento, parcelas_solicitadas, clientes(razao_social), pedido_itens(quantidade_pedida)')
      .eq('id', pedidoId)
      .maybeSingle()

    if (!p) return

    const cliente = p.clientes as unknown as { razao_social: string } | null
    const itens = (p.pedido_itens ?? []) as { quantidade_pedida: number }[]
    const unidades = itens.reduce((a, i) => a + Number(i.quantidade_pedida), 0)
    const forma =
      (ROTULOS_PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento) +
      (p.parcelas_solicitadas ? ` (${p.parcelas_solicitadas}x)` : '')

    await notificarEquipe('pedido_novo', {
      pedidoId,
      assunto: `Pedido novo #${p.numero} — ${cliente?.razao_social ?? 'cliente'}`,
      html: templateInterno({
        titulo: `Pedido #${p.numero} recebido`,
        linhas: [
          { rotulo: 'Cliente', valor: cliente?.razao_social ?? '—' },
          { rotulo: 'Artes', valor: String(itens.length) },
          { rotulo: 'Unidades', valor: String(unidades) },
          { rotulo: 'Pagamento', valor: forma },
        ],
        texto: p.notas ? `Notas do cliente: ${p.notas}` : undefined,
        urlAcao: `${urlDoSite()}/admin/pedidos/${pedidoId}`,
        rotuloAcao: 'ABRIR O PEDIDO',
      }),
    })
  } catch (e) {
    console.error('[pedido_novo]', e)
  }
}

export async function verificarPodeParcelar(): Promise<boolean> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles')
    .select('cliente_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.cliente_id) return false

  const { data, error } = await supabase.rpc('cliente_pode_parcelar', {
    p_cliente_id: perfil.cliente_id,
  })

  if (error) return false

  return !!data
}