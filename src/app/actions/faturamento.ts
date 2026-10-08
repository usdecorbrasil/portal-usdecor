'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gerarNfe, transmitirEEsperar, NF_SITUACAO } from '@/lib/bling/nfe'
import { gerarEObterCobrancas, lancarEObterContas, gravarRastreioNasContas } from '@/lib/bling/cobranca'
import { sincronizarPedidoComBling, rastreioPedido } from '@/lib/bling/pedido'
import { salvarDocumento, baixarArquivo } from '@/lib/storage/documentos'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateNfEmitida } from '@/lib/resend/templates/nf-emitida'
import { templateCobranca, type CobrancaEmail } from '@/lib/resend/templates/cobranca'
import { MAX_PARCELAS, taxaDoPedido, valorCobranca } from '@/lib/pagamento/config'
import { FORMAS_FATURA, ROTULOS_FATURA } from '@/lib/pagamento/faturar'
import { urlDoSite } from '@/lib/site'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateBloqueioCredito } from '@/lib/resend/templates/bloqueio-credito'

/**
 * Faturamento a partir de "Pedido pronto".
 *
 * `faturarPedido` é o botão único: define a forma de pagamento (decisão de
 * admin/financeiro desde 07/10/2026 — o cliente não escolhe mais no
 * carrinho), pedido de venda no Bling, cobrança (boleto/Pix), NF-e quando o
 * pedido é com nota, e-mails ao cliente e a etapa "Faturado".
 * `emitirNotaFiscal` e `gerarCobranca` continuam disponíveis para repetir um
 * passo que ficou pela metade.
 *
 * Nenhum passo muda o pedido no portal antes de o Bling confirmar — e todos
 * podem ser repetidos: NF que ficou "processando" é consultada de novo,
 * cobrança já lançada só relê os links.
 */

type Resultado = { ok: true; detalhe: string } | { ok: false; erro: string }

const ROTULOS_PAGAMENTO: Record<string, string> = ROTULOS_FATURA

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && (perfil.role === 'admin' || perfil.role === 'financeiro')
}

type Pedido = {
  id: string
  numero: number
  cliente_id: string
  /** NULL até o faturamento definir. */
  forma_pagamento: string | null
  total: number | string
  taxa_pagamento_percentual: number | string | null
  taxa_pagamento_fixa: number | string | null
  emitir_nf: boolean | null
  bling_pedido_id: number | string | null
  bling_sync_status: string | null
  bling_nf_id: number | string | null
  nf_numero: string | null
  cobranca_gerada_em: string | null
  bloqueio_liberado_em: string | null
  agrupado_em: string | null
  link_pagamento: string | null
  vencimento_avista: string | null
  clientes: { email: string; razao_social: string; bling_contato_id: number | string | null } | null
  pedido_parcelas: {
    id: string
    numero: number
    valor: number | string
    vencimento: string
    link_boleto: string | null
    link_pix: string | null
  }[]
}

async function carregar(pedidoId: string): Promise<Pedido | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('pedidos')
    .select(
      'id, numero, cliente_id, forma_pagamento, total, taxa_pagamento_percentual, taxa_pagamento_fixa, ' +
        'emitir_nf, bling_pedido_id, bling_sync_status, bling_nf_id, nf_numero, cobranca_gerada_em, agrupado_em, link_pagamento, vencimento_avista, bloqueio_liberado_em, ' +
        'clientes(email, razao_social, bling_contato_id), ' +
        'pedido_parcelas(id, numero, valor, vencimento, link_boleto, link_pix)'
    )
    .eq('id', pedidoId)
    .maybeSingle()
  return (data as unknown as Pedido) ?? null
}

/* --------------------------------- faturar --------------------------------- */


export type OpcoesFatura = {
  /** Forma escolhida no Faturar. Obrigatória quando o pedido ainda não tem forma. */
  forma?: string
  /** Boleto parcelado (obrigatório) ou cartão de crédito (opcional, 1 = à vista). */
  parcelas?: number
  /** Boleto parcelado: data do primeiro boleto (AAAA-MM-DD). */
  primeiroVencimento?: string
  /** Limite de crédito estourado: motivo da liberação pelo dono (mín. 10 caracteres). */
  motivoLiberacao?: string
  /** Cartão: link de pagamento gerado fora do portal (Bling ou maquininha). */
  linkPagamento?: string
}

const schemaFatura = z.object({
  pedidoId: z.string().uuid(),
  forma: z.enum(FORMAS_FATURA).optional(),
  parcelas: z
    .number({ message: 'Quantidade de parcelas inválida.' })
    .int('Quantidade de parcelas inválida.')
    .min(1, 'Quantidade de parcelas inválida.')
    .max(MAX_PARCELAS, `No máximo ${MAX_PARCELAS} parcelas.`)
    .optional(),
  primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do primeiro vencimento inválida.').optional(),
  motivoLiberacao: z
    .string()
    .trim()
    .min(10, 'Descreva o motivo da liberação com pelo menos 10 caracteres.')
    .max(500, 'O motivo da liberação pode ter no máximo 500 caracteres.')
    .optional(),
  linkPagamento: z.string().trim().url().startsWith('https://').max(500).optional(),
})

/**
 * Botão único. Cada passo é retomável: se algo parar no meio (SEFAZ lenta,
 * Bling sem link ainda), o retorno diz o que faltou e clicar de novo continua
 * de onde parou, sem duplicar pedido, cobrança ou nota.
 *
 * O passo zero é a forma de pagamento: a RPC
 * `admin_definir_forma_pagamento_faturamento` valida forma ativa, permitida
 * ao cliente, parcelas, parcela mínima pelo valor real e limite de crédito, e
 * grava tudo (com as parcelas) antes de o Bling entrar. Se ela recusar, o
 * Faturar para ali com a mensagem.
 */
export async function faturarPedido(
  pedidoId: string,
  opcoes: OpcoesFatura = {}
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaFatura.safeParse({
    pedidoId,
    forma: opcoes.forma || undefined,
    parcelas: opcoes.parcelas ?? undefined,
    primeiroVencimento: opcoes.primeiroVencimento || undefined,
    motivoLiberacao: opcoes.motivoLiberacao?.trim() || undefined,
    linkPagamento: opcoes.linkPagamento?.trim() || undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const campo = issue.path[0]
    return {
      ok: false,
      erro:
        campo === 'linkPagamento'
          ? 'Link de pagamento inválido — precisa começar com https://'
          : campo === 'forma'
          ? 'Escolha a forma de pagamento.'
          : issue.message,
    }
  }
  const d = parsed.data

  let p = await carregar(d.pedidoId)
  if (!p) return { ok: false, erro: 'Pedido não encontrado.' }
  if (p.agrupado_em) return { ok: false, erro: 'Pedido agrupado — fature pelo agrupador.' }

  const supabase = await createClient()
  const { data: statusAtual } = await supabase.rpc('status_atual', { p_pedido_id: p.id })
  if (statusAtual !== 'pronto' && statusAtual !== 'faturado') {
    return { ok: false, erro: `Só é possível faturar um pedido em "Pedido pronto" (atual: ${statusAtual}).` }
  }

  const feito: string[] = []

  // 0. Forma de pagamento — decisão de quem fatura, com o valor real em mãos.
  //    Só em "pronto" e só enquanto nada foi ao Bling: depois que o pedido de
  //    venda ou a cobrança existem lá, a forma está congelada (refazer as
  //    parcelas apagaria os boletos emitidos). Clicar de novo só continua.
  const jaNoBling = !!p.bling_pedido_id || !!p.cobranca_gerada_em
  if (statusAtual === 'pronto' && jaNoBling && d.forma && d.forma !== p.forma_pagamento) {
    return {
      ok: false,
      erro: 'A forma de pagamento já foi ao Bling com este pedido e não pode mais mudar. Para trocar, cancele o pedido de venda no Bling e refature.',
    }
  }
  if (statusAtual === 'pronto' && !jaNoBling) {
    const forma = d.forma ?? p.forma_pagamento
    if (!forma) return { ok: false, erro: 'Escolha a forma de pagamento antes de faturar.' }

    // A liberação de crédito vai junto, na mesma transação: só fica gravada
    // se a forma passou por todas as regras
    const { error } = await supabase.rpc('admin_definir_forma_pagamento_faturamento', {
      p_pedido_id: p.id,
      p_forma: forma,
      p_parcelas: d.parcelas ?? null,
      p_primeiro_vencimento: d.primeiroVencimento ?? null,
      p_motivo_liberacao: d.motivoLiberacao ?? null,
    })
    if (error) {
      // Limite estourado: fica marcado para o dashboard e a equipe é avisada.
      // Quem fatura vê a mensagem na hora; o aviso é para quem decide o crédito
      if (error.hint === 'limite_credito') {
        await marcarBloqueioCredito(p, forma, d.parcelas ?? null)
      }
      return { ok: false, erro: error.message }
    }

    p = (await carregar(p.id)) ?? p
    if (d.motivoLiberacao && p.bloqueio_liberado_em) feito.push('limite de crédito liberado')
    revalidatePath(`/admin/pedidos/${p.id}`)
  }

  // Daqui em diante a forma precisa existir (pedido antigo em "faturado"
  // sem forma não deveria acontecer, mas o Bling e a cobrança dependem dela)
  const forma = p.forma_pagamento
  if (!forma) {
    return { ok: false, erro: 'Este pedido está sem forma de pagamento. Defina-a antes de continuar.' }
  }

  // 1. Pedido de venda no Bling (idempotente: adota o que já existe)
  if (!p.bling_pedido_id) {
    await sincronizarPedidoComBling(p.id)
    p = (await carregar(p.id)) ?? p
    if (!p.bling_pedido_id) {
      return { ok: false, erro: 'O Bling não aceitou o pedido de venda. Veja o erro no topo da tela e tente de novo.' }
    }
    feito.push('pedido no Bling')
  }

  // 2. Cobrança — boleto/Pix pelo Bling; cartão é cobrado fora e só avisa
  if (forma.startsWith('boleto') || forma === 'pix') {
    if (!p.cobranca_gerada_em) {
      const c = await gerarCobrancaInterno(p)
      if (!c.ok) return { ok: false, erro: `Pedido no Bling, mas a cobrança falhou: ${c.erro}` }
      feito.push('cobrança enviada')
    }
  } else if (!p.cobranca_gerada_em) {
    // Cartão: a conta a receber vai para o Bling com a forma do cartão, para
    // o financeiro dar baixa por lá quando o dinheiro cair. O link de
    // pagamento é gerado fora do portal (o Bling não expõe pela API) e
    // normalmente só existe depois do pedido de venda. Com link em mãos,
    // envia agora; sem link, o pedido fica "Faturado" aguardando o envio
    const c = await lancarContasCartao(p)
    if (!c.ok) return { ok: false, erro: `Pedido no Bling, mas a conta a receber falhou: ${c.erro}` }
    feito.push('conta a receber lançada')

    const link = d.linkPagamento ?? p.link_pagamento
    if (link) {
      const e = await enviarLinkPagamentoInterno(p, link)
      if (!e.ok) return { ok: false, erro: `Pedido no Bling, mas o link não foi enviado: ${e.erro}` }
      feito.push('link de pagamento enviado')
    } else {
      feito.push('aguardando link de pagamento')
    }
  }

  // 3. Etapa "Faturado" — a partir daqui o pedido sai da produção
  if (statusAtual === 'pronto') {
    const { error } = await supabase.rpc('marcar_pedido_faturado', {
      p_pedido_id: p.id,
      p_observacao: feito.length ? feito.join(', ') : null,
    })
    if (error) return { ok: false, erro: `Cobrança ok, mas a etapa não avançou: ${error.message}` }
  }

  // 4. Nota fiscal, quando o pedido é com nota
  let avisoNf = ''
  if (p.emitir_nf !== false && !p.nf_numero) {
    const n = await emitirNotaFiscalInterno(p)
    if (n.ok) feito.push('NF emitida')
    else avisoNf = ` Nota fiscal: ${n.erro}`
  }

  revalidatePath(`/admin/pedidos/${p.id}`)
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin')
  revalidatePath('/pedidos')

  return {
    ok: true,
    detalhe:
      (feito.length ? `Faturado: ${feito.join(', ')}.` : 'Pedido já estava faturado.') + avisoNf,
  }
}

/**
 * A RPC recusou a forma por limite de crédito: o pedido fica marcado como
 * bloqueado (aparece no dashboard em "precisa da sua decisão") e a equipe
 * recebe o aviso. Nunca derruba o Faturar — a mensagem já voltou para a tela.
 */
async function marcarBloqueioCredito(p: Pedido, forma: string, parcelas: number | null) {
  try {
    const admin = createAdminClient()
    await admin.from('pedidos').update({ bloqueado_credito: true }).eq('id', p.id)

    const supabase = await createClient()
    const [{ data: emUso }, { data: cliente }] = await Promise.all([
      supabase.rpc('credito_em_uso', { p_cliente_id: p.cliente_id }),
      admin.from('clientes').select('limite_credito').eq('id', p.cliente_id).maybeSingle(),
    ])

    const total = Number(p.total)
    const rotulo =
      (ROTULOS_PAGAMENTO[forma] ?? forma) + (parcelas && parcelas > 1 ? ` (${parcelas}x)` : '')

    // `credito_em_uso` já conta este pedido quando ele estava em boleto
    // (pedido antigo); a RPC tira antes de comparar — o e-mail mostra o mesmo
    const proprio = p.forma_pagamento?.startsWith('boleto')
      ? valorCobranca(
          total,
          Number(p.taxa_pagamento_percentual ?? 0),
          Number(p.taxa_pagamento_fixa ?? 0),
          p.forma_pagamento,
          (p.pedido_parcelas ?? []).length || 1
        )
      : 0
    const emUsoSemEste = Math.max(0, Number(emUso ?? 0) - proprio)

    await notificarEquipe('pedido_bloqueado_credito', {
      pedidoId: p.id,
      assunto: `Pedido #${p.numero} bloqueado por limite de crédito — ${p.clientes?.razao_social ?? 'cliente'}`,
      html: templateBloqueioCredito({
        numero: Number(p.numero),
        cliente: p.clientes?.razao_social ?? '—',
        forma: rotulo,
        valorPedido: total,
        emUso: emUsoSemEste,
        limite: Number(cliente?.limite_credito ?? 0),
        urlPedido: `${urlDoSite()}/admin/pedidos/${p.id}`,
      }),
    })
    revalidatePath('/admin/dashboard')
  } catch (e) {
    console.error('[pedido_bloqueado_credito]', e)
  }
}

/* --------------------------- link de pagamento --------------------------- */

/**
 * Cartão: grava o link gerado no Bling (ou na maquininha) e envia a cobrança
 * ao cliente. Pode ser repetido para trocar o link — o e-mail sai de novo.
 */
export async function enviarLinkPagamento(pedidoId: string, linkPagamento: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.object({
    pedidoId: z.string().uuid(),
    linkPagamento: z.string().trim().url().startsWith('https://').max(500),
  }).safeParse({ pedidoId, linkPagamento })
  if (!parsed.success) return { ok: false, erro: 'Link inválido — precisa começar com https://' }

  const p = await carregar(parsed.data.pedidoId)
  if (!p) return { ok: false, erro: 'Pedido não encontrado.' }
  if (!p.forma_pagamento?.startsWith('cartao')) {
    return { ok: false, erro: 'Link de pagamento é só para pedidos em cartão.' }
  }

  const r = await enviarLinkPagamentoInterno(p, parsed.data.linkPagamento)
  revalidatePath(`/admin/pedidos/${p.id}`)
  return r
}

async function enviarLinkPagamentoInterno(p: Pedido, link: string): Promise<Resultado> {
  const admin = createAdminClient()
  const forma = p.forma_pagamento ?? ''

  await admin.from('pedidos').update({ link_pagamento: link }).eq('id', p.id)

  if (p.clientes?.email) {
    const total = Number(p.total)
    const taxa = taxaDoPedido(
      total,
      Number(p.taxa_pagamento_percentual ?? 0),
      Number(p.taxa_pagamento_fixa ?? 0),
      forma,
      1
    )
    const totalCobrado = Math.round((total + taxa) * 100) / 100
    await enviarEmail({
      tipo: 'cobranca',
      pedidoId: p.id,
      destinatario: p.clientes.email,
      assunto: `Cobrança do pedido #${p.numero}`,
      html: templateCobranca({
        clienteNome: p.clientes.razao_social,
        numero: Number(p.numero),
        rotuloPagamento: ROTULOS_PAGAMENTO[forma] ?? forma,
        cobrancas: [],
        totalCobrado,
        linkPagamento: link,
        urlPedido: `${urlDoSite()}/pedidos/${p.id}`,
      }),
    })
  }

  await admin.from('pedidos').update({ cobranca_gerada_em: new Date().toISOString() }).eq('id', p.id)
  return { ok: true, detalhe: 'Link de pagamento enviado ao cliente.' }
}

/* --------------------------- rastreio nas contas --------------------------- */

/**
 * Escreve nas contas a receber do Bling quais pedidos do portal elas cobram
 * (texto longo do rastreio: no agrupamento, cada original com metragem e
 * valor). Nunca derruba a cobrança: falha só vai para o log.
 */
async function rastrearContas(pedidoId: string, contaIds: (number | null)[]): Promise<void> {
  if (!contaIds.some(Boolean)) return
  try {
    const rastreio = await rastreioPedido(pedidoId)
    if (rastreio) await gravarRastreioNasContas(contaIds, rastreio.longo)
  } catch (e) {
    console.error('[bling] rastreio nas contas a receber:', e)
  }
}

/* ------------------------------ cartão: conta ------------------------------ */

/**
 * Cartão de crédito/débito: lança as contas a receber do pedido de venda no
 * Bling e guarda o id de cada uma nas parcelas do portal. Não há boleto nem
 * Pix — a cobrança é pelo link, cobrada fora — e a baixa é feita no Bling.
 * Repetível: contas já lançadas não são erro.
 */
async function lancarContasCartao(p: Pedido): Promise<Resultado> {
  if (!p.bling_pedido_id) return { ok: false, erro: 'O pedido ainda não foi enviado ao Bling. Use "Tentar de novo" primeiro.' }

  const contatoId = Number(p.clientes?.bling_contato_id ?? 0)
  if (!contatoId) return { ok: false, erro: 'Cliente sem vínculo com o Bling.' }

  const forma = p.forma_pagamento ?? ''
  const total = Number(p.total)
  const parcelas = (p.pedido_parcelas ?? []).slice().sort((a, b) => a.numero - b.numero)
  const taxa = taxaDoPedido(
    total,
    Number(p.taxa_pagamento_percentual ?? 0),
    Number(p.taxa_pagamento_fixa ?? 0),
    forma,
    parcelas.length || 1
  )
  const totalCobrado = Math.round((total + taxa) * 100) / 100

  const esperados =
    parcelas.length > 0
      ? parcelas.map((x) => ({ valor: Number(x.valor), vencimento: String(x.vencimento).slice(0, 10) }))
      : [{ valor: totalCobrado, vencimento: p.vencimento_avista ?? new Date().toISOString().slice(0, 10) }]

  const r = await lancarEObterContas(contatoId, Number(p.bling_pedido_id), esperados)
  if (!r.ok) return { ok: false, erro: r.erro }

  // Guarda o vínculo com a conta do Bling na parcela correspondente. À vista
  // não tem linha de parcela: a conta existe lá, ligada ao pedido pela origem
  const admin = createAdminClient()
  for (const [i, c] of r.contas.entries()) {
    const parcela =
      parcelas.find(
        (x) => String(x.vencimento).slice(0, 10) === c.vencimento && Math.abs(Number(x.valor) - c.valor) < 0.01
      ) ?? parcelas[i] ?? null
    if (parcela && c.contaId) {
      await admin.from('pedido_parcelas').update({ bling_conta_id: c.contaId }).eq('id', parcela.id)
    }
  }

  await rastrearContas(p.id, r.contas.map((c) => c.contaId))

  const quantas = r.contas.length
  return {
    ok: true,
    detalhe: r.jaLancadas
      ? 'A conta a receber já estava lançada no Bling.'
      : quantas > 0
      ? `${quantas === 1 ? 'Conta a receber lançada' : `${quantas} contas a receber lançadas`} no Bling, para baixa pelo financeiro.`
      : 'Contas lançadas no Bling; a leitura delas ainda não voltou.',
  }
}

/* ------------------------------- nota fiscal ------------------------------- */

export async function emitirNotaFiscal(pedidoId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(pedidoId)
  if (!parsed.success) return { ok: false, erro: 'Pedido inválido.' }

  const p = await carregar(parsed.data)
  if (!p) return { ok: false, erro: 'Pedido não encontrado.' }

  const r = await emitirNotaFiscalInterno(p)
  revalidatePath(`/admin/pedidos/${p.id}`)
  revalidatePath('/admin/pedidos')
  return r
}

async function emitirNotaFiscalInterno(p: Pedido): Promise<Resultado> {
  if (p.emitir_nf === false) return { ok: false, erro: 'Este pedido está marcado para sair sem nota fiscal.' }
  if (!p.bling_pedido_id) return { ok: false, erro: 'O pedido ainda não foi enviado ao Bling. Use "Tentar de novo" primeiro.' }
  if (p.nf_numero) return { ok: true, detalhe: `Nota fiscal nº ${p.nf_numero} já emitida.` }

  const admin = createAdminClient()

  // Passo 1: a nota no Bling. Guardada na hora: se a transmissão travar, a
  // próxima tentativa consulta em vez de gerar outra
  let nfId = Number(p.bling_nf_id ?? 0)
  if (!nfId) {
    const g = await gerarNfe(Number(p.bling_pedido_id))
    if (!g.ok) return { ok: false, erro: g.erro }
    nfId = g.nfId
    await admin.from('pedidos').update({ bling_nf_id: nfId }).eq('id', p.id)
  }

  // Passo 2: SEFAZ
  const t = await transmitirEEsperar(nfId)

  if (!t.ok) {
    if ('processando' in t) {
      return {
        ok: false,
        erro: `A SEFAZ ainda não respondeu (situação: ${NF_SITUACAO[t.situacao] ?? t.situacao}). Aguarde alguns segundos e clique de novo.`,
      }
    }
    return { ok: false, erro: t.erro }
  }

  const nf = t.nf

  // Passo 3: arquivos. Falhar aqui não desfaz a nota — ela existe na SEFAZ;
  // o link do DANFE fica gravado de qualquer forma
  const pasta = `pedidos/${p.id}`
  let pdfPath: string | null = null
  let xmlPath: string | null = null
  const anexos: { filename: string; content: Buffer }[] = []

  const linkPdf = nf.linkPDF ?? nf.linkDanfe
  if (linkPdf) {
    const pdf = await baixarArquivo(linkPdf)
    if (pdf && pdf.contentType.includes('pdf')) {
      pdfPath = await salvarDocumento(`${pasta}/nfe-${nf.numero ?? nfId}.pdf`, pdf.conteudo, 'application/pdf')
      anexos.push({ filename: `NFe-${nf.numero ?? nfId}.pdf`, content: pdf.conteudo })
    }
  }

  if (nf.xml) {
    // O Bling devolve ora o XML, ora um link para ele
    const xml = nf.xml.startsWith('http') ? await baixarArquivo(nf.xml) : { conteudo: Buffer.from(nf.xml, 'utf-8'), contentType: 'application/xml' }
    if (xml) {
      xmlPath = await salvarDocumento(`${pasta}/nfe-${nf.numero ?? nfId}.xml`, xml.conteudo, 'application/xml')
      anexos.push({ filename: `NFe-${nf.numero ?? nfId}.xml`, content: xml.conteudo })
    }
  }

  // Passo 4: registra e avança a etapa (RPC valida quem chama)
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_registrar_nf', {
    p_pedido_id: p.id,
    p_bling_nf_id: nfId,
    p_numero: nf.numero ?? String(nfId),
    p_chave: nf.chaveAcesso,
    p_pdf_path: pdfPath,
    p_xml_path: xmlPath,
    p_link_danfe: nf.linkDanfe ?? nf.linkPDF,
  })
  if (error) return { ok: false, erro: `NF autorizada, mas não foi registrada no portal: ${error.message}` }

  // Passo 5: cliente
  if (p.clientes?.email) {
    await enviarEmail({
      tipo: 'nf_emitida',
      pedidoId: p.id,
      destinatario: p.clientes.email,
      assunto: `Nota fiscal do pedido #${p.numero}`,
      html: templateNfEmitida({
        clienteNome: p.clientes.razao_social,
        numero: Number(p.numero),
        nfNumero: nf.numero ?? String(nfId),
        chave: nf.chaveAcesso,
        urlPedido: `${urlDoSite()}/pedidos/${p.id}`,
      }),
      anexos,
    })
  }

  return {
    ok: true,
    detalhe: `Nota fiscal nº ${nf.numero ?? nfId} autorizada${anexos.length ? ' e enviada ao cliente' : ''}.`,
  }
}

/* -------------------------------- cobrança -------------------------------- */

export async function gerarCobranca(pedidoId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(pedidoId)
  if (!parsed.success) return { ok: false, erro: 'Pedido inválido.' }

  const p = await carregar(parsed.data)
  if (!p) return { ok: false, erro: 'Pedido não encontrado.' }

  const r = await gerarCobrancaInterno(p)
  revalidatePath(`/admin/pedidos/${p.id}`)
  return r
}

async function gerarCobrancaInterno(p: Pedido): Promise<Resultado> {
  if (!p.bling_pedido_id) return { ok: false, erro: 'O pedido ainda não foi enviado ao Bling. Use "Tentar de novo" primeiro.' }

  const forma = p.forma_pagamento
  if (!forma) return { ok: false, erro: 'Pedido sem forma de pagamento. Defina-a no Faturar.' }
  if (!forma.startsWith('boleto') && forma !== 'pix') {
    // Cartão: só a conta a receber; o link vai pelo bloco "Pedido faturado"
    const c = await lancarContasCartao(p)
    if (!c.ok) return c
    if (p.link_pagamento) {
      const e = await enviarLinkPagamentoInterno(p, p.link_pagamento)
      if (!e.ok) return e
      return { ok: true, detalhe: `${c.detalhe} Link de pagamento reenviado ao cliente.` }
    }
    return c
  }

  const contatoId = Number(p.clientes?.bling_contato_id ?? 0)
  if (!contatoId) return { ok: false, erro: 'Cliente sem vínculo com o Bling.' }

  const total = Number(p.total)
  const parcelas = (p.pedido_parcelas ?? []).slice().sort((a, b) => a.numero - b.numero)
  const taxa = taxaDoPedido(
    total,
    Number(p.taxa_pagamento_percentual ?? 0),
    Number(p.taxa_pagamento_fixa ?? 0),
    forma,
    parcelas.length || 1
  )
  const totalCobrado = Math.round((total + taxa) * 100) / 100

  // À vista não tem linha em pedido_parcelas: a cobrança é uma só, hoje
  const esperados =
    parcelas.length > 0
      ? parcelas.map((x) => ({ valor: Number(x.valor), vencimento: String(x.vencimento).slice(0, 10) }))
      : [{ valor: totalCobrado, vencimento: p.vencimento_avista ?? new Date().toISOString().slice(0, 10) }]

  const r = await gerarEObterCobrancas(contatoId, Number(p.bling_pedido_id), esperados)
  if (!r.ok) return { ok: false, erro: r.erro }

  if (r.cobrancas.length === 0) {
    return {
      ok: false,
      erro: 'As contas foram lançadas, mas o Bling ainda não devolveu boleto ou Pix. Aguarde um instante e clique de novo.',
    }
  }

  const admin = createAdminClient()
  const pasta = `pedidos/${p.id}`
  const anexos: { filename: string; content: Buffer }[] = []
  const paraEmail: CobrancaEmail[] = []

  // Casa cada cobrança do Bling com a parcela do portal e guarda links + PDF
  for (const [i, c] of r.cobrancas.entries()) {
    const parcela =
      parcelas.find(
        (x) => String(x.vencimento).slice(0, 10) === c.vencimento && Math.abs(Number(x.valor) - c.valor) < 0.01
      ) ?? parcelas[i] ?? null

    let pdfPath: string | null = null
    if (c.boleto) {
      const pdf = await baixarArquivo(c.boleto)
      if (pdf && pdf.contentType.includes('pdf')) {
        const nome = `boleto-${parcela?.numero ?? i + 1}.pdf`
        pdfPath = await salvarDocumento(`${pasta}/${nome}`, pdf.conteudo, 'application/pdf')
        anexos.push({ filename: nome, content: pdf.conteudo })
      }
    }

    if (parcela) {
      await admin
        .from('pedido_parcelas')
        .update({ bling_conta_id: c.contaId, link_boleto: c.boleto, link_pix: c.pix, boleto_pdf_path: pdfPath })
        .eq('id', parcela.id)
    } else {
      await admin
        .from('pedidos')
        .update({ link_boleto: c.boleto, link_pix: c.pix, boleto_pdf_path: pdfPath })
        .eq('id', p.id)
    }

    paraEmail.push({
      numero: parcela?.numero ?? i + 1,
      valor: c.valor,
      vencimento: c.vencimento,
      linkBoleto: c.boleto,
      linkPix: c.pix,
    })
  }

  await rastrearContas(p.id, r.cobrancas.map((c) => c.contaId))

  await admin.from('pedidos').update({ cobranca_gerada_em: new Date().toISOString() }).eq('id', p.id)

  if (p.clientes?.email) {
    await enviarEmail({
      tipo: 'cobranca',
      pedidoId: p.id,
      destinatario: p.clientes.email,
      assunto: `Cobrança do pedido #${p.numero}`,
      html: templateCobranca({
        clienteNome: p.clientes.razao_social,
        numero: Number(p.numero),
        rotuloPagamento: ROTULOS_PAGAMENTO[forma] ?? forma,
        cobrancas: paraEmail.sort((a, b) => a.numero - b.numero),
        totalCobrado,
        urlPedido: `${urlDoSite()}/pedidos/${p.id}`,
      }),
      anexos,
    })
  }

  const n = paraEmail.length
  return {
    ok: true,
    detalhe: r.semLinks
      ? `${n} cobrança(s) lançada(s), mas nem todas com link ainda. Clique de novo em instantes para completar.`
      : `${n} cobrança(s) gerada(s) e enviada(s) ao cliente.`,
  }
}