import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarConta, listarContasRecebidas, type SituacaoConta } from '@/lib/bling/cobranca'
import { taxaDoPedido } from '@/lib/pagamento/config'

/**
 * Baixa automática de pagamento.
 *
 * Chamada de hora em hora pelo workflow .github/workflows/baixa-pagamentos.yml
 * (o cron da Vercel no plano Hobby só roda uma vez por dia). Olha os pedidos
 * faturados ainda sem pagamento, consulta as contas a receber deles no Bling
 * e, quando uma está recebida, grava a parcela (`pedido_parcelas.pago_em`) e,
 * com tudo recebido, o pedido (`pedidos.pago_em` / `valor_pago`, mais a
 * linha "Pagamento identificado" no andamento).
 *
 * Idempotente: as funções do banco só gravam onde ainda não há pagamento, e
 * pedidos já pagos nem entram na consulta. Rodar de novo não duplica nada.
 *
 * Rate limit do Bling (3 req/s): há pausa entre chamadas e um teto de
 * chamadas por execução — o que sobrar fica para a próxima hora.
 */

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const PAUSA_MS = 400
const MAX_CHAMADAS_BLING = 80
const APOS_FATURADO = ['faturado', 'nf_emitida', 'expedido', 'entregue']

const pausa = () => new Promise((r) => setTimeout(r, PAUSA_MS))

type Parcela = {
  id: string
  numero: number
  valor: number | string
  vencimento: string
  pago_em: string | null
  bling_conta_id: number | string | null
}

type Pedido = {
  id: string
  numero: number
  total: number | string
  forma_pagamento: string
  bling_pedido_id: number | string | null
  taxa_pagamento_percentual: number | string | null
  taxa_pagamento_fixa: number | string | null
  clientes: { bling_contato_id: number | string | null } | null
  pedido_parcelas: Parcela[]
  pedido_status_historico: { status: string; created_at: string }[]
}

function autorizado(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  return request.headers.get('authorization') === `Bearer ${segredo}`
}

function statusAtual(p: Pedido) {
  const hist = (p.pedido_status_historico ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return hist[0]?.status ?? 'aguardando'
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('pedidos')
    .select(`
      id, numero, total, forma_pagamento, bling_pedido_id,
      taxa_pagamento_percentual, taxa_pagamento_fixa,
      clientes(bling_contato_id),
      pedido_parcelas(id, numero, valor, vencimento, pago_em, bling_conta_id),
      pedido_status_historico(status, created_at)
    `)
    .is('pago_em', null)
    .is('cancelado_em', null)
    .is('agrupado_em', null)
    .not('bling_pedido_id', 'is', null)

  if (error) {
    return NextResponse.json({ erro: `Falha ao ler pedidos: ${error.message}` }, { status: 500 })
  }

  const pedidos = ((data ?? []) as unknown as Pedido[]).filter((p) =>
    APOS_FATURADO.includes(statusAtual(p))
  )

  let chamadas = 0
  const resumo = { pedidos: pedidos.length, parcelasPagas: 0, pedidosPagos: 0, pendentes: 0, erros: [] as string[] }

  // Contas recebidas por contato, lidas uma vez só para os pedidos sem id de conta
  const recebidasPorContato = new Map<number, SituacaoConta[]>()

  for (const p of pedidos) {
    if (chamadas >= MAX_CHAMADAS_BLING) {
      resumo.pendentes++
      continue
    }

    try {
      const contatoId = Number(p.clientes?.bling_contato_id ?? 0)
      const blingPedidoId = Number(p.bling_pedido_id ?? 0)
      const parcelas = (p.pedido_parcelas ?? []).slice().sort((a, b) => a.numero - b.numero)

      let valorRecebido = 0
      let tudoRecebido = true

      if (parcelas.length > 0) {
        for (const parcela of parcelas) {
          if (parcela.pago_em) {
            valorRecebido += Number(parcela.valor)
            continue
          }

          const conta = await situacaoDaParcela(parcela, contatoId, blingPedidoId, recebidasPorContato, async () => {
            chamadas++
            await pausa()
          })

          if (conta?.recebida) {
            const { data: gravou } = await admin.rpc('registrar_pagamento_parcela', {
              p_parcela_id: parcela.id,
              p_pago_em: new Date().toISOString(),
            })
            if (gravou) resumo.parcelasPagas++
            valorRecebido += conta.valor
          } else {
            tudoRecebido = false
          }
        }
      } else {
        // À vista: uma conta só, sem linha de parcela — casa pela origem ou
        // por vencimento + valor cobrado
        if (!contatoId) {
          tudoRecebido = false
        } else {
          const recebidas = await recebidasDoContato(contatoId, recebidasPorContato, async () => {
            chamadas++
            await pausa()
          })
          const total = Number(p.total)
          const taxa = taxaDoPedido(
            total,
            Number(p.taxa_pagamento_percentual ?? 0),
            Number(p.taxa_pagamento_fixa ?? 0),
            p.forma_pagamento,
            1
          )
          const cobrado = Math.round((total + taxa) * 100) / 100
          const conta =
            recebidas.find((c) => c.origemId === blingPedidoId) ??
            recebidas.find((c) => Math.abs(c.valor - cobrado) < 0.01)
          if (conta?.recebida) valorRecebido = conta.valor
          else tudoRecebido = false
        }
      }

      if (tudoRecebido && valorRecebido > 0) {
        const { data: gravou, error: e } = await admin.rpc('registrar_pagamento_pedido', {
          p_pedido_id: p.id,
          p_valor_pago: Math.round(valorRecebido * 100) / 100,
          p_pago_em: new Date().toISOString(),
        })
        if (e) resumo.erros.push(`#${p.numero}: ${e.message}`)
        else if (gravou) resumo.pedidosPagos++
      }
    } catch (e) {
      resumo.erros.push(`#${p.numero}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, chamadasBling: chamadas, ...resumo })
}

async function recebidasDoContato(
  contatoId: number,
  cache: Map<number, SituacaoConta[]>,
  contar: () => Promise<void>
) {
  const emCache = cache.get(contatoId)
  if (emCache) return emCache
  await contar()
  const lista = await listarContasRecebidas(contatoId)
  cache.set(contatoId, lista)
  return lista
}

/**
 * Situação da conta de uma parcela. Com `bling_conta_id` consulta direto;
 * sem, procura nas contas recebidas do contato pela origem (pedido de venda)
 * e, em último caso, por vencimento + valor.
 */
async function situacaoDaParcela(
  parcela: Parcela,
  contatoId: number,
  blingPedidoId: number,
  cache: Map<number, SituacaoConta[]>,
  contar: () => Promise<void>
): Promise<SituacaoConta | null> {
  const contaId = Number(parcela.bling_conta_id ?? 0)
  if (contaId) {
    await contar()
    return consultarConta(contaId)
  }
  if (!contatoId) return null

  const recebidas = await recebidasDoContato(contatoId, cache, contar)
  const valor = Number(parcela.valor)
  const vencimento = String(parcela.vencimento).slice(0, 10)
  return (
    recebidas.find(
      (c) => c.origemId === blingPedidoId && c.vencimento === vencimento && Math.abs(c.valor - valor) < 0.01
    ) ??
    recebidas.find((c) => c.vencimento === vencimento && Math.abs(c.valor - valor) < 0.01) ??
    null
  )
}
