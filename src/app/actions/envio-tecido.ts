'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import { notificarEquipe } from '@/lib/notificacoes/enviar'
import { templateInterno } from '@/lib/resend/templates/interno'
import { urlDoSite } from '@/lib/site'
import { paraNumeroBr } from '@/lib/numero'
import { lerDocumento } from '@/lib/despesas/ler-documento'

/**
 * Envio de tecido — separado do pedido.
 *
 * Cliente ou equipe registram que o tecido foi mandado; a NF de remessa pode
 * vir junto ou depois. O saldo não muda aqui: só na conferência, que é da
 * equipe e cria a entrada no estoque (RPC `conferir_envio_tecido`).
 *
 * A NF vai para o bucket `documentos` pelo servidor (arquivo pequeno, cabe no
 * limite da Vercel), em `tecidos/{cliente}/{envio}/nf-remessa.{ext}`.
 */

type Resultado = { ok: true } | { ok: false; erro: string }

const NF_MAX = 4 * 1024 * 1024
const FORMATOS_NF: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

function validarNf(arquivo: FormDataEntryValue | null): string | null {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (arquivo.size > NF_MAX) return 'A nota precisa ter até 4 MB.'
  if (!FORMATOS_NF[arquivo.type]) return 'Envie a nota em PDF, JPG ou PNG.'
  return null
}

async function subirNf(clienteId: string, envioId: string, arquivo: File): Promise<string | null> {
  const admin = createAdminClient()
  const caminho = `tecidos/${clienteId}/${envioId}/nf-remessa.${FORMATOS_NF[arquivo.type]}`
  const { error } = await admin.storage
    .from('documentos')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })
  if (error) {
    console.error('[envio-tecido] upload NF', error.message)
    return null
  }
  return caminho
}

function metrosDe(v: FormDataEntryValue | null): number {
  return paraNumeroBr(typeof v === 'string' ? v : '')
}

/**
 * Registra o envio. Cliente: sempre para si. Equipe: informa o cliente.
 * A nota é opcional — pode ser anexada depois com `anexarNf`.
 */
export async function registrarEnvioTecido(formData: FormData): Promise<Resultado> {
  const perfil = await lerPerfil()
  if (!perfil) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  const equipe = perfil.papel !== 'cliente'
  const clienteId = equipe ? String(formData.get('clienteId') ?? '') : perfil.clienteId ?? ''

  const parsed = z
    .object({
      clienteId: z.string().uuid('Escolha o cliente.'),
      tecidoId: z.string().uuid('Escolha o tecido.'),
      metros: z.number().positive('Informe a metragem enviada.').max(1000000),
      nfNumero: z.string().trim().max(40).optional(),
      observacao: z.string().trim().max(500).optional(),
    })
    .safeParse({
      clienteId,
      tecidoId: formData.get('tecidoId'),
      metros: metrosDe(formData.get('metros')),
      nfNumero: String(formData.get('nfNumero') ?? '') || undefined,
      observacao: String(formData.get('observacao') ?? '') || undefined,
    })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const nf = formData.get('nf')
  const erroNf = validarNf(nf)
  if (erroNf) return { ok: false, erro: erroNf }

  const supabase = await createClient()
  // A política do banco confere de novo cliente_id, criado_por e situação
  const { data, error } = await supabase
    .from('tecido_envios')
    .insert({
      cliente_id: parsed.data.clienteId,
      tecido_id: parsed.data.tecidoId,
      metros_informados: parsed.data.metros,
      nf_numero: parsed.data.nfNumero || null,
      observacao: parsed.data.observacao || null,
      criado_por: perfil.id,
    })
    .select('id, tecidos(nome), clientes(razao_social)')
    .single()
  if (error || !data) return { ok: false, erro: error?.message ?? 'Não foi possível registrar o envio.' }

  if (nf instanceof File && nf.size > 0) {
    const caminho = await subirNf(parsed.data.clienteId, data.id as string, nf)
    if (caminho) {
      await supabase.rpc('anexar_nf_envio_tecido', {
        p_envio_id: data.id,
        p_nf_numero: parsed.data.nfNumero || null,
        p_nf_caminho: caminho,
      })
    }
  }

  const tecido = (data.tecidos as unknown as { nome: string } | null)?.nome ?? '—'
  const cliente = (data.clientes as unknown as { razao_social: string } | null)?.razao_social ?? '—'

  // Aviso à equipe: só quando é o cliente avisando. Nunca derruba o registro
  if (!equipe) {
    await notificarEquipe('tecido_enviado', {
      assunto: `Tecido enviado — ${cliente}`,
      html: templateInterno({
        titulo: `${cliente} avisou envio de tecido`,
        linhas: [
          { rotulo: 'Tecido', valor: tecido },
          { rotulo: 'Metros informados', valor: parsed.data.metros.toLocaleString('pt-BR') },
          { rotulo: 'NF de remessa', valor: parsed.data.nfNumero || (nf instanceof File && nf.size > 0 ? 'anexada' : 'não informada') },
        ],
        texto: parsed.data.observacao
          ? `Observação do cliente: ${parsed.data.observacao}`
          : 'O saldo só entra no estoque depois da conferência.',
        urlAcao: `${urlDoSite()}/admin/estoque?cliente=${parsed.data.clienteId}`,
        rotuloAcao: 'CONFERIR NA ABA ESTOQUE',
      }),
    })
  }

  revalidar(parsed.data.clienteId)
  return { ok: true }
}

/** Anexa (ou troca) a NF de remessa de um envio ainda não conferido. */
export async function anexarNf(envioId: string, formData: FormData): Promise<Resultado> {
  const perfil = await lerPerfil()
  if (!perfil) return { ok: false, erro: 'Sessão expirada. Entre novamente.' }

  const parsed = z
    .object({ envioId: z.string().uuid(), nfNumero: z.string().trim().max(40).optional() })
    .safeParse({ envioId, nfNumero: String(formData.get('nfNumero') ?? '') || undefined })
  if (!parsed.success) return { ok: false, erro: 'Envio inválido.' }

  const nf = formData.get('nf')
  const temArquivo = nf instanceof File && nf.size > 0
  if (!temArquivo && !parsed.data.nfNumero) {
    return { ok: false, erro: 'Informe o número da nota ou anexe o arquivo.' }
  }
  const erroNf = validarNf(nf)
  if (erroNf) return { ok: false, erro: erroNf }

  const supabase = await createClient()
  // A leitura já passa pela política: cliente só enxerga os próprios envios
  const { data: envio } = await supabase
    .from('tecido_envios')
    .select('cliente_id, situacao')
    .eq('id', parsed.data.envioId)
    .maybeSingle()
  if (!envio) return { ok: false, erro: 'Envio não encontrado.' }
  if (envio.situacao !== 'enviado') {
    return { ok: false, erro: 'Este envio já foi conferido; a nota não pode mais ser trocada.' }
  }

  let caminho: string | null = null
  if (temArquivo) {
    caminho = await subirNf(envio.cliente_id as string, parsed.data.envioId, nf as File)
    if (!caminho) return { ok: false, erro: 'Não foi possível enviar o arquivo da nota.' }
  }

  const { error } = await supabase.rpc('anexar_nf_envio_tecido', {
    p_envio_id: parsed.data.envioId,
    p_nf_numero: parsed.data.nfNumero || null,
    p_nf_caminho: caminho,
  })
  if (error) return { ok: false, erro: error.message }

  revalidar(envio.cliente_id as string)
  return { ok: true }
}

/** Equipe mede o que chegou. Cria a entrada no estoque com a metragem medida. */
export async function conferirEnvio(
  envioId: string,
  metros: number,
  observacao?: string
): Promise<Resultado> {
  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({
      envioId: z.string().uuid(),
      metros: z.number().positive('Informe a metragem conferida.').max(1000000),
      observacao: z.string().trim().max(500).optional(),
    })
    .safeParse({ envioId, metros, observacao: observacao || undefined })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: envio } = await supabase
    .from('tecido_envios')
    .select('cliente_id')
    .eq('id', parsed.data.envioId)
    .maybeSingle()

  const { error } = await supabase.rpc('conferir_envio_tecido', {
    p_envio_id: parsed.data.envioId,
    p_metros: parsed.data.metros,
    p_observacao: parsed.data.observacao || null,
  })
  if (error) return { ok: false, erro: error.message }

  revalidar((envio?.cliente_id as string | undefined) ?? null)
  return { ok: true }
}

/** Nada chegou, ou chegou outra coisa. Motivo obrigatório; o saldo não muda. */
export async function recusarEnvio(envioId: string, motivo: string): Promise<Resultado> {
  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') return { ok: false, erro: 'Acesso negado.' }

  const parsed = z
    .object({
      envioId: z.string().uuid(),
      motivo: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres.').max(500),
    })
    .safeParse({ envioId, motivo })
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: envio } = await supabase
    .from('tecido_envios')
    .select('cliente_id')
    .eq('id', parsed.data.envioId)
    .maybeSingle()

  const { error } = await supabase.rpc('recusar_envio_tecido', {
    p_envio_id: parsed.data.envioId,
    p_motivo: parsed.data.motivo,
  })
  if (error) return { ok: false, erro: error.message }

  revalidar((envio?.cliente_id as string | undefined) ?? null)
  return { ok: true }
}

function revalidar(clienteId: string | null) {
  revalidatePath('/admin/estoque')
  revalidatePath('/tecidos')
  if (clienteId) revalidatePath(`/admin/clientes/${clienteId}`)
}

/* ------------------------------------------------------------------ */
/* Leitura da NF de remessa pela IA, na conferência (pedido do dono, 12/10/2026) */

export type NfLida = {
  numero: string | null
  emissao: string | null
  emitente: string | null
  itens: { descricao: string; quantidade: number; unidade: string | null; tecido: string | null }[]
  /** Soma das quantidades dos itens de tecido (a nota de remessa vem em metros). */
  metrosLidos: number | null
  /** O que não bate com o envio, em texto para a tela. */
  divergencias: string[]
  /** O que bate, para dar segurança a quem confere. */
  confere: string[]
}

const MEDIA_POR_EXT: Record<string, 'application/pdf' | 'image/jpeg' | 'image/png'> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

/**
 * Lê a nota anexada ao envio e compara com o que o cliente informou. Nada é
 * gravado: a equipe vê o resultado e decide a metragem na conferência. O
 * cliente nunca vê isso — a leitura é só da equipe.
 */
export async function lerNfEnvio(envioId: string): Promise<{ ok: true; nf: NfLida } | { ok: false; erro: string }> {
  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') return { ok: false, erro: 'Acesso negado.' }
  if (!z.string().uuid().safeParse(envioId).success) return { ok: false, erro: 'Envio inválido.' }

  const supabase = await createClient()
  const { data: envio } = await supabase
    .from('tecido_envios')
    .select('id, nf_caminho, nf_numero, metros_informados, tecidos(nome), clientes(razao_social, cnpj)')
    .eq('id', envioId)
    .maybeSingle()
  if (!envio) return { ok: false, erro: 'Envio não encontrado.' }
  const e = envio as unknown as { nf_caminho: string | null; nf_numero: string | null; metros_informados: number | string; tecidos: { nome: string } | null; clientes: { razao_social: string; cnpj: string | null } | null }
  if (!e.nf_caminho) return { ok: false, erro: 'Este envio ainda não tem a nota anexada.' }
  const ext = e.nf_caminho.split('.').pop()?.toLowerCase() ?? ''
  const mediaType = MEDIA_POR_EXT[ext]
  if (!mediaType) return { ok: false, erro: 'A nota precisa estar em PDF, JPG ou PNG para a leitura.' }

  const admin = createAdminClient()
  const { data: arquivo, error } = await admin.storage.from('documentos').download(e.nf_caminho)
  if (error || !arquivo) return { ok: false, erro: 'Não deu para abrir o arquivo da nota.' }

  const [{ data: tecidos }, { data: clientes }] = await Promise.all([
    supabase.from('tecidos').select('nome').eq('ativo', true).order('nome'),
    supabase.from('clientes').select('razao_social, cnpj').eq('ativo', true).is('arquivado', false).order('razao_social'),
  ])
  const leitura = await lerDocumento({
    conteudo: Buffer.from(await arquivo.arrayBuffer()),
    mediaType,
    categorias: [],
    suprimentos: [],
    tecidos: (tecidos ?? []).map((t) => t.nome as string),
    clientes: (clientes ?? []).map((c) => ({ nome: c.razao_social as string, doc: String(c.cnpj ?? '').replace(/\D/g, '') || null })),
  })
  if (!leitura.ok) return leitura
  const d = leitura.documento

  // Itens de tecido: os marcados pela IA; se ela não marcou nenhum, todos (nota de remessa é só tecido)
  const marcados = d.itens.filter((i) => i.tecido_de_cliente)
  const itens = (marcados.length ? marcados : d.itens).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, tecido: i.tecido }))
  const emMetros = itens.filter((i) => !i.unidade || /^(m|mt|mts|metro|metros)$/i.test(i.unidade))
  const metrosLidos = emMetros.length ? Math.round(emMetros.reduce((s, i) => s + i.quantidade, 0) * 1000) / 1000 : null

  const divergencias: string[] = []
  const confere: string[] = []
  const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (e.nf_numero && d.numero) {
    if (soDigitos(e.nf_numero) === soDigitos(d.numero)) confere.push(`nº da nota ${d.numero}`)
    else divergencias.push(`nº da nota: o cliente informou ${e.nf_numero}, a nota diz ${d.numero}`)
  } else if (d.numero) confere.push(`nº da nota ${d.numero} (o cliente não tinha informado)`)

  const cnpjCliente = soDigitos(e.clientes?.cnpj)
  const docsNaNota = [d.fornecedor_doc, d.destinatario_doc].map(soDigitos).filter(Boolean)
  const nomeCliente = (e.clientes?.razao_social ?? '').toLowerCase()
  const nomesNaNota = [d.fornecedor_nome, d.destinatario_nome, d.tecido_cliente].filter(Boolean).map((n) => (n as string).toLowerCase())
  if (cnpjCliente && docsNaNota.includes(cnpjCliente)) confere.push('CNPJ do cliente está na nota')
  else if (nomeCliente && nomesNaNota.some((n) => n.includes(nomeCliente.split(' ')[0]) || nomeCliente.includes(n))) confere.push('nome do cliente está na nota')
  else if (docsNaNota.length || nomesNaNota.length) divergencias.push(`a nota não parece ser do cliente ${e.clientes?.razao_social ?? ''} (emitente ${d.fornecedor_nome ?? '?'}, destinatário ${d.destinatario_nome ?? '?'})`)

  const tecidoEnvio = (e.tecidos?.nome ?? '').toLowerCase()
  const tecidosNaNota = itens.map((i) => (i.tecido ?? i.descricao).toLowerCase())
  if (tecidoEnvio && tecidosNaNota.some((t) => t.includes(tecidoEnvio) || tecidoEnvio.includes(t))) confere.push(`tecido ${e.tecidos?.nome}`)
  else if (tecidoEnvio && itens.length) divergencias.push(`tecido: o envio diz ${e.tecidos?.nome}; a nota traz ${itens.map((i) => i.tecido ?? i.descricao).join(', ')}`)

  const informados = Number(e.metros_informados)
  if (metrosLidos != null) {
    if (Math.abs(metrosLidos - informados) <= Math.max(0.5, informados * 0.01)) confere.push(`${metrosLidos} m, igual ao informado`)
    else divergencias.push(`metragem: o cliente informou ${informados} m, a nota soma ${metrosLidos} m`)
  } else if (itens.length) divergencias.push('a nota não traz quantidade em metros (confira a unidade dos itens)')

  return { ok: true, nf: { numero: d.numero, emissao: d.emissao, emitente: d.fornecedor_nome, itens, metrosLidos, divergencias, confere } }
}
