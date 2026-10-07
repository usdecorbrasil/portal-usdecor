'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateInterno } from '@/lib/resend/templates/interno'
import { urlDoSite } from '@/lib/site'
import { urlDocumento } from '@/lib/storage/documentos'

const schema = z.object({
  itens: z.array(
    z.object({
      produto_id: z.string().uuid(),
      quantidade: z.number().int().min(1).max(100000),
    })
  ).min(1, 'O pedido precisa ter ao menos um item')
   .max(200, 'Máximo de 200 itens por pedido'),
  notas: z.string().trim().max(2000).optional(),
})

type Resultado =
  | { ok: true; numero: number; total: number }
  | { ok: false; erro: string }

/**
 * Pedido enviado pelo carrinho. Sem forma de pagamento nem parcelas: desde
 * 07/10/2026 quem decide isso é admin/financeiro, no Faturar, com o valor
 * real do pedido em mãos. Por isso também não há aqui validação de forma
 * permitida, parcela mínima nem limite de crédito — tudo passou para a RPC
 * `admin_definir_forma_pagamento_faturamento`.
 */
export async function criarPedido(dados: {
  itens: { produto_id: string; quantidade: number }[]
  notas?: string
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

  // Boleto vencido trava pedido novo. O gatilho no banco é quem garante;
  // aqui só antecipamos a mensagem, sem jargão
  const atraso = await situacaoAtraso()
  if (atraso.bloqueado) {
    return { ok: false, erro: 'Há boleto em atraso. Regularize para enviar novos pedidos.' }
  }

  // Toda a validação real acontece dentro da função do banco:
  // preço, catálogo do cliente, produto ativo, anti-duplicidade.
  const { data, error } = await supabase.rpc('criar_pedido', {
    p_itens: parsed.data.itens,
    p_notas: parsed.data.notas || null,
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
      .select('numero, notas, clientes(razao_social), pedido_itens(quantidade_pedida)')
      .eq('id', pedidoId)
      .maybeSingle()

    if (!p) return

    const cliente = p.clientes as unknown as { razao_social: string } | null
    const itens = (p.pedido_itens ?? []) as { quantidade_pedida: number }[]
    const unidades = itens.reduce((a, i) => a + Number(i.quantidade_pedida), 0)

    // Sem linha de pagamento: a forma é definida no faturamento
    await notificarEquipe('pedido_novo', {
      pedidoId,
      assunto: `Pedido novo #${p.numero} — ${cliente?.razao_social ?? 'cliente'}`,
      html: templateInterno({
        titulo: `Pedido #${p.numero} recebido`,
        linhas: [
          { rotulo: 'Cliente', valor: cliente?.razao_social ?? '—' },
          { rotulo: 'Artes', valor: String(itens.length) },
          { rotulo: 'Unidades', valor: String(unidades) },
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

/* ------------------------------ boleto atrasado ------------------------------ */

export type BoletoVencido = {
  pedidoId: string
  numero: number
  parcela: string | null
  valor: number
  vencimento: string
  linhaDigitavel: string | null
  linkBoleto: string | null
  pdfUrl: string | null
  linkCartao: string | null
}

/**
 * Boletos vencidos e não pagos do cliente logado, respeitando a liberação
 * manual (só contam os que venceram depois dela). Mesma regra de
 * `cliente_boletos_vencidos` no banco — mexeu numa, mexa na outra.
 */
export async function situacaoAtraso(): Promise<{ bloqueado: boolean; vencidos: BoletoVencido[] }> {
  const vazio = { bloqueado: false, vencidos: [] as BoletoVencido[] }
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return vazio

  const { data: perfil } = await supabase
    .from('profiles')
    .select('cliente_id, clientes(atraso_liberado_em)')
    .eq('id', user.id)
    .single()
  if (!perfil?.cliente_id) return vazio

  const liberadoEm = (perfil.clientes as unknown as { atraso_liberado_em: string | null } | null)
    ?.atraso_liberado_em
  const corteLiberacao = liberadoEm ? liberadoEm.slice(0, 10) : null
  const hoje = new Date().toISOString().slice(0, 10)

  const { data: parcelas } = await supabase
    .from('pedido_parcelas')
    .select(
      'id, numero, valor, vencimento, pago_em, boleto_linha, link_boleto, boleto_pdf_path, ' +
        'pedidos!inner(id, numero, cancelado_em, link_pagamento, forma_pagamento)'
    )
    .is('pago_em', null)
    .is('pedidos.cancelado_em', null)
    .lt('vencimento', hoje)
    .order('vencimento')

  const linhas = ((parcelas ?? []) as any[]).filter(
    (p) => !corteLiberacao || String(p.vencimento).slice(0, 10) > corteLiberacao
  )
  if (linhas.length === 0) return vazio

  const vencidos: BoletoVencido[] = []
  for (const p of linhas) {
    const ehCartao = String(p.pedidos?.forma_pagamento ?? '').startsWith('cartao')
    vencidos.push({
      pedidoId: p.pedidos.id,
      numero: Number(p.pedidos.numero),
      parcela: `parcela ${p.numero}`,
      valor: Number(p.valor),
      vencimento: String(p.vencimento).slice(0, 10),
      linhaDigitavel: (p.boleto_linha as string | null) ?? null,
      linkBoleto: (p.link_boleto as string | null) ?? null,
      pdfUrl: await urlDocumento(p.boleto_pdf_path),
      linkCartao: ehCartao ? ((p.pedidos.link_pagamento as string | null) ?? null) : null,
    })
  }

  return { bloqueado: true, vencidos }
}
