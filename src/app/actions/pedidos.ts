'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateInterno } from '@/lib/resend/templates/interno'
import { urlDoSite } from '@/lib/site'
import { urlDocumento } from '@/lib/storage/documentos'
import { valorCobranca } from '@/lib/pagamento/config'

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
  | { ok: true; numero: number; total: number; travadoPorAtraso: boolean }
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

  // Boleto vencido há mais de 5 dias úteis não impede o envio (regra de
  // 08/10/2026): o pedido entra, mas o banco recusa qualquer lançamento de
  // etapa até o pagamento ou a liberação pelo dono. Aqui só se descobre a
  // situação para a tela avisar o cliente
  const atraso = await situacaoAtraso()

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
    travadoPorAtraso: atraso.bloqueado,
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
  /** AAAA-MM-DD: dia em que o boleto passa a travar os pedidos (6º dia útil após o vencimento). */
  travaEm: string
  /** Já passou dos 5 dias úteis: os pedidos do cliente não andam. */
  trava: boolean
}

export type SituacaoAtraso = {
  /** Há boleto vencido há mais de 5 dias úteis (e sem liberação do dono). */
  bloqueado: boolean
  vencidos: BoletoVencido[]
  /** Prazo mais próximo para regularizar sem travar (só quando há vencido e ainda não trava). */
  prazo: string | null
}

/**
 * Boletos vencidos e não pagos do cliente logado, com a data em que cada um
 * passa a travar os pedidos. Quem calcula é o banco
 * (`cliente_boletos_atraso`: liberação manual, 5 dias úteis, feriados); aqui
 * só se buscam os dados de pagamento para a tela.
 */
export async function situacaoAtraso(): Promise<SituacaoAtraso> {
  const vazio: SituacaoAtraso = { bloqueado: false, vencidos: [], prazo: null }
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return vazio

  const { data: perfil } = await supabase
    .from('profiles')
    .select('cliente_id')
    .eq('id', user.id)
    .single()
  if (!perfil?.cliente_id) return vazio

  const { data: atraso } = await supabase.rpc('cliente_boletos_atraso', {
    p_cliente_id: perfil.cliente_id,
  })
  const linhas = (atraso ?? []) as {
    pedido_id: string
    parcela_id: string | null
    vencimento: string
    trava_em: string
    trava: boolean
  }[]
  if (linhas.length === 0) return vazio

  const idsParcelas = linhas.map((l) => l.parcela_id).filter((id): id is string => !!id)
  const idsPedidos = [...new Set(linhas.map((l) => l.pedido_id))]

  const [{ data: parcelas }, { data: pedidos }] = await Promise.all([
    idsParcelas.length
      ? supabase
          .from('pedido_parcelas')
          .select('id, numero, valor, boleto_linha, link_boleto, boleto_pdf_path')
          .in('id', idsParcelas)
      : Promise.resolve({ data: [] }),
    supabase
      .from('pedidos')
      .select(
        'id, numero, total, taxa_pagamento_percentual, taxa_pagamento_fixa, forma_pagamento, ' +
          'link_pagamento, link_boleto, boleto_pdf_path'
      )
      .in('id', idsPedidos),
  ])

  const porParcela = new Map(((parcelas ?? []) as any[]).map((p) => [p.id, p]))
  const porPedido = new Map(((pedidos ?? []) as any[]).map((p) => [p.id, p]))

  const vencidos: BoletoVencido[] = []
  for (const l of linhas) {
    const ped = porPedido.get(l.pedido_id)
    if (!ped) continue
    const ehCartao = String(ped.forma_pagamento ?? '').startsWith('cartao')
    const par = l.parcela_id ? porParcela.get(l.parcela_id) : null
    const fonte = par ?? ped
    vencidos.push({
      pedidoId: ped.id,
      numero: Number(ped.numero),
      parcela: par ? `parcela ${par.numero}` : 'à vista',
      valor: par
        ? Number(par.valor)
        : valorCobranca(
            Number(ped.total),
            Number(ped.taxa_pagamento_percentual ?? 0),
            Number(ped.taxa_pagamento_fixa ?? 0),
            String(ped.forma_pagamento ?? ''),
            1
          ),
      vencimento: String(l.vencimento).slice(0, 10),
      linhaDigitavel: par ? ((par.boleto_linha as string | null) ?? null) : null,
      linkBoleto: (fonte.link_boleto as string | null) ?? null,
      pdfUrl: await urlDocumento(fonte.boleto_pdf_path),
      linkCartao: ehCartao ? ((ped.link_pagamento as string | null) ?? null) : null,
      travaEm: String(l.trava_em).slice(0, 10),
      trava: l.trava === true,
    })
  }

  const bloqueado = vencidos.some((v) => v.trava)
  const prazo = bloqueado
    ? null
    : vencidos.map((v) => v.travaEm).sort()[0] ?? null

  return { bloqueado, vencidos, prazo }
}
