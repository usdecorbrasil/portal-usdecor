'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gerarNfe, transmitirEEsperar, NF_SITUACAO } from '@/lib/bling/nfe'
import { gerarEObterCobrancas } from '@/lib/bling/cobranca'
import { salvarDocumento, baixarArquivo } from '@/lib/storage/documentos'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateNfEmitida } from '@/lib/resend/templates/nf-emitida'
import { templateCobranca, type CobrancaEmail } from '@/lib/resend/templates/cobranca'
import { taxaDoPedido } from '@/lib/pagamento/config'
import { urlDoSite } from '@/lib/site'

/**
 * Faturamento a partir de "Pedido pronto": NF-e e cobrança, cada uma no seu
 * botão. O pedido de venda já existe no Bling quando estes rodam.
 *
 * Os dois nunca mudam o pedido no portal antes de o Bling confirmar — e os
 * dois podem ser repetidos: NF que ficou "processando" é consultada de novo,
 * cobrança já lançada só relê os links.
 */

type Resultado = { ok: true; detalhe: string } | { ok: false; erro: string }

const ROTULOS_PAGAMENTO: Record<string, string> = {
  boleto_avista: 'Boleto à vista',
  boleto_parcelado: 'Boleto parcelado',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
}

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
  forma_pagamento: string
  total: number | string
  taxa_pagamento_percentual: number | string | null
  taxa_pagamento_fixa: number | string | null
  emitir_nf: boolean | null
  bling_pedido_id: number | string | null
  bling_nf_id: number | string | null
  nf_numero: string | null
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
      'id, numero, forma_pagamento, total, taxa_pagamento_percentual, taxa_pagamento_fixa, ' +
        'emitir_nf, bling_pedido_id, bling_nf_id, nf_numero, ' +
        'clientes(email, razao_social, bling_contato_id), ' +
        'pedido_parcelas(id, numero, valor, vencimento, link_boleto, link_pix)'
    )
    .eq('id', pedidoId)
    .maybeSingle()
  return (data as unknown as Pedido) ?? null
}

/* ------------------------------- nota fiscal ------------------------------- */

export async function emitirNotaFiscal(pedidoId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(pedidoId)
  if (!parsed.success) return { ok: false, erro: 'Pedido inválido.' }

  const p = await carregar(parsed.data)
  if (!p) return { ok: false, erro: 'Pedido não encontrado.' }
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

  revalidatePath(`/admin/pedidos/${p.id}`)
  revalidatePath('/admin/pedidos')

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
  if (!p.bling_pedido_id) return { ok: false, erro: 'O pedido ainda não foi enviado ao Bling. Use "Tentar de novo" primeiro.' }

  const forma = p.forma_pagamento
  if (!forma.startsWith('boleto') && forma !== 'pix') {
    return { ok: false, erro: 'Cartão é cobrado fora do portal — não há boleto nem Pix para gerar.' }
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
      : [{ valor: totalCobrado, vencimento: new Date().toISOString().slice(0, 10) }]

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

  revalidatePath(`/admin/pedidos/${p.id}`)

  const n = paraEmail.length
  return {
    ok: true,
    detalhe: r.semLinks
      ? `${n} cobrança(s) lançada(s), mas nem todas com link ainda. Clique de novo em instantes para completar.`
      : `${n} cobrança(s) gerada(s) e enviada(s) ao cliente.`,
  }
}
