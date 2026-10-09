import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateInterno } from '@/lib/resend/templates/interno'
import { urlDoSite } from '@/lib/site'
import { PRAZO_COMPROVANTE_DIAS } from '@/lib/contas-pagar/condicoes'
import { hojeBrasilia } from '@/lib/datas'

/**
 * Resumo diário de pendências de contas a pagar, por e-mail.
 *
 * Chamada uma vez por dia pelo workflow .github/workflows/avisos-diarios.yml.
 * Manda para quem estiver em Configurações → Notificações → "Pendências de
 * contas a pagar" quando há:
 *   - nota de compra sem foto/PDF há mais de PRAZO_COMPROVANTE_DIAS dias
 *     (o mesmo aviso vermelho do dashboard);
 *   - conta a pagar vencida e não paga.
 * Dia sem pendência não manda nada.
 *
 * Uma vez por dia no máximo: a data do último envio fica em
 * `configuracoes.avisos_diarios`, e rodar de novo no mesmo dia só responde
 * "já enviado". (O `email_log` não serve de trava aqui: ele é por pedido.)
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CHAVE = 'avisos_diarios'

function autorizado(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  return request.headers.get('authorization') === `Bearer ${segredo}`
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const admin = createAdminClient()
  // Data de hoje em Brasília (o servidor roda em UTC)
  const agora = Date.now()
  const hoje = hojeBrasilia(new Date(agora))
  const forcar = request.nextUrl.searchParams.get('forcar') === '1'

  const { data: cfg } = await admin.from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle()
  let enviados: Record<string, string> = {}
  try {
    enviados = cfg?.valor ? JSON.parse(cfg.valor) : {}
  } catch {
    enviados = {}
  }
  if (enviados.contas_pagar === hoje && !forcar) {
    return NextResponse.json({ ok: true, enviado: false, motivo: 'já enviado hoje' })
  }

  const limite = new Date(agora - PRAZO_COMPROVANTE_DIAS * 24 * 60 * 60 * 1000).toISOString()
  const [notas, vencidas] = await Promise.all([
    admin
      .from('despesas')
      .select('fornecedor_nome, numero, total, criado_em')
      .is('arquivo_path', null)
      .is('excluido_em', null)
      .not('condicao_pagamento', 'is', null)
      .lt('criado_em', limite)
      .order('criado_em'),
    admin
      .from('contas_pagar')
      .select('descricao, parcela, parcelas, valor, vencimento')
      .is('pago_em', null)
      .is('cancelada_em', null)
      .lt('vencimento', hoje)
      .order('vencimento'),
  ])
  if (notas.error || vencidas.error) {
    return NextResponse.json({ erro: notas.error?.message ?? vencidas.error?.message }, { status: 500 })
  }

  type Nota = { fornecedor_nome: string | null; numero: string | null; total: number | string; criado_em: string }
  type Vencida = { descricao: string; parcela: number; parcelas: number; valor: number | string; vencimento: string }
  const ns = (notas.data ?? []) as Nota[]
  const vs = (vencidas.data ?? []) as Vencida[]

  if (!ns.length && !vs.length) {
    return NextResponse.json({ ok: true, enviado: false, motivo: 'sem pendências' })
  }

  const somaN = ns.reduce((s, n) => s + Number(n.total), 0)
  const somaV = vs.reduce((s, v) => s + Number(v.valor), 0)
  const MAX = 15
  const blocos: string[] = []
  if (ns.length) {
    blocos.push(
      `Notas sem foto ou PDF há mais de ${PRAZO_COMPROVANTE_DIAS} dias:\n` +
        ns
          .slice(0, MAX)
          .map((n) => `• ${n.fornecedor_nome ?? 'Fornecedor não informado'}${n.numero ? ` · nota ${n.numero}` : ''} · lançada em ${dataBr(n.criado_em)} · R$ ${brl(Number(n.total))}`)
          .join('\n') +
        (ns.length > MAX ? `\n… e mais ${ns.length - MAX}` : '')
    )
  }
  if (vs.length) {
    blocos.push(
      'Contas a pagar vencidas:\n' +
        vs
          .slice(0, MAX)
          .map((v) => `• ${dataBr(v.vencimento)} · ${v.descricao}${v.parcelas > 1 ? ` (${v.parcela}/${v.parcelas})` : ''} · R$ ${brl(Number(v.valor))}`)
          .join('\n') +
        (vs.length > MAX ? `\n… e mais ${vs.length - MAX}` : '')
    )
  }

  const linhas = [
    ...(ns.length ? [{ rotulo: 'Sem comprovante', valor: `${ns.length} nota${ns.length > 1 ? 's' : ''} · R$ ${brl(somaN)}` }] : []),
    ...(vs.length ? [{ rotulo: 'Vencidas', valor: `${vs.length} conta${vs.length > 1 ? 's' : ''} · R$ ${brl(somaV)}` }] : []),
  ]
  const destino = ns.length ? '/admin/financeiro/a-pagar?situacao=todas&comprovante=pendente' : '/admin/financeiro/a-pagar'

  await notificarEquipe('contas_pagar_pendencias', {
    assunto: [
      ns.length ? `${ns.length} nota${ns.length > 1 ? 's' : ''} sem comprovante` : null,
      vs.length ? `${vs.length} conta${vs.length > 1 ? 's' : ''} vencida${vs.length > 1 ? 's' : ''}` : null,
    ]
      .filter(Boolean)
      .join(' · ') + ' — contas a pagar',
    html: templateInterno({
      titulo: 'Pendências de contas a pagar',
      linhas,
      texto: blocos.join('\n\n'),
      urlAcao: `${urlDoSite()}${destino}`,
      rotuloAcao: ns.length ? 'Anexar comprovantes' : 'Abrir contas a pagar',
    }),
  })

  // Marca o dia mesmo se a lista de destinatários estiver vazia: não há
  // o que reenviar até amanhã. A linha pode não existir: upsert pela chave.
  await admin
    .from('configuracoes')
    .upsert({ chave: CHAVE, valor: JSON.stringify({ ...enviados, contas_pagar: hoje }), atualizado_em: new Date().toISOString() }, { onConflict: 'chave' })

  return NextResponse.json({ ok: true, enviado: true, notasSemComprovante: ns.length, contasVencidas: vs.length })
}
