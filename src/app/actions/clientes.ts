'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateConviteAcesso } from '@/lib/resend/templates/convite-acesso'
import { templateRedefinirSenha } from '@/lib/resend/templates/redefinir-senha'
import { urlDoSite } from '@/lib/site'
import { tentarSincronizarContato } from '@/lib/bling/contato'
import {
  registrar,
  diferencas,
  ROTULOS_CLIENTE,
} from '@/lib/auditoria'

const precoBr = z.string()
  .transform((v) => Number(String(v).replace(',', '.')))
  .refine((v) => !isNaN(v) && v > 0, 'Preço por metro inválido')

const camposBase = {
  razao_social: z.string().trim().min(2).max(200),
  cnpj: z.string().transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v.length === 14, 'CNPJ deve ter 14 dígitos'),
  email: z.string().trim().toLowerCase().email(),
  contato: z.string().trim().max(120).optional(),
  telefone: z.string().transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v === '' || (v.length >= 10 && v.length <= 13), 'Telefone inválido')
        .optional(),
  // Campos fiscais: sem eles o contato no Bling não serve para faturar
  inscricao_estadual: z.string().trim().max(30).optional(),
  indicador_ie: z.string().transform((v) => Number(v || 9))
        .refine((v) => [1, 2, 9].includes(v), 'Indicador de IE inválido'),
  cep: z.string().transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v === '' || v.length === 8, 'CEP deve ter 8 dígitos')
        .optional(),
  endereco: z.string().trim().max(200).optional(),
  numero: z.string().trim().max(20).optional(),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().max(100).optional(),
  municipio: z.string().trim().max(100).optional(),
  uf: z.string().trim().toUpperCase().max(2).optional(),
}

// O preço é definido no cadastro e, depois, só pela tela do cliente — por isso
// não faz parte dos campos comuns aos dois formulários
const schemaCriar = z.object({ ...camposBase, preco_metro: precoBr })
const schemaEditar = z.object({ id: z.string().uuid(), ...camposBase })

type ResultadoCriar =
  | { ok: true; senha: string; avisoBling?: string; avisoEmail?: string }
  | { ok: false; erro: string }
type Resultado = { ok: true; avisoBling?: string } | { ok: false; erro: string }

/** Admin e financeiro administram clientes */
async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && (perfil.role === 'admin' || perfil.role === 'financeiro')
}

function lerCampos(formData: FormData) {
  return {
    razao_social: formData.get('razao_social'),
    cnpj: formData.get('cnpj'),
    email: formData.get('email'),
    contato: formData.get('contato') || undefined,
    telefone: formData.get('telefone') || undefined,
    preco_metro: formData.get('preco_metro'),
    inscricao_estadual: formData.get('inscricao_estadual') || undefined,
    indicador_ie: formData.get('indicador_ie') || '9',
    cep: formData.get('cep') || undefined,
    endereco: formData.get('endereco') || undefined,
    numero: formData.get('numero') || undefined,
    complemento: formData.get('complemento') || undefined,
    bairro: formData.get('bairro') || undefined,
    municipio: formData.get('municipio') || undefined,
    uf: formData.get('uf') || undefined,
  }
}

export async function criarCliente(
  _prev: unknown,
  formData: FormData
): Promise<ResultadoCriar> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaCriar.safeParse(lerCampos(formData))
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const dados = parsed.data
  const admin = createAdminClient()

  const { data: cliente, error: erroCliente } = await admin
    .from('clientes')
    .insert({
      razao_social: dados.razao_social,
      cnpj: dados.cnpj,
      email: dados.email,
      contato: dados.contato || null,
      telefone: dados.telefone || null,
      preco_metro: dados.preco_metro,
      inscricao_estadual: dados.inscricao_estadual || null,
      indicador_ie: dados.indicador_ie,
      cep: dados.cep || null,
      endereco: dados.endereco || null,
      numero: dados.numero || null,
      complemento: dados.complemento || null,
      bairro: dados.bairro || null,
      municipio: dados.municipio || null,
      uf: dados.uf || null,
    })
    .select('id')
    .single()

  if (erroCliente) {
    if (erroCliente.code === '23505') {
      return { ok: false, erro: 'Já existe um cliente com este CNPJ.' }
    }
    return { ok: false, erro: 'Não foi possível cadastrar o cliente.' }
  }

  const senha = gerarSenha()

  const { data: novoUser, error: erroUser } =
    await admin.auth.admin.createUser({
      email: dados.email,
      password: senha,
      email_confirm: true,
      // Senha gerada aqui e enviada por e-mail: vale só até o primeiro acesso
      app_metadata: { senha_provisoria: true },
    })

  if (erroUser || !novoUser.user) {
    await admin.from('clientes').delete().eq('id', cliente.id)
    return {
      ok: false,
      erro: erroUser?.message.includes('already')
        ? 'Este e-mail já tem acesso ao portal.'
        : 'Não foi possível criar o acesso.',
    }
  }

const { error: erroPerfil } = await admin.from('profiles').insert({
    id: novoUser.user.id,
    role: 'cliente',
    cliente_id: cliente.id,
    nome: dados.contato || dados.razao_social,
  })

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(novoUser.user.id)
    await admin.from('clientes').delete().eq('id', cliente.id)
    return { ok: false, erro: 'Não foi possível vincular o acesso.' }
  }

  // Espelha no ERP. Falhar aqui não desfaz o cadastro: o cliente já existe no
  // portal e o vínculo pode ser refeito depois, mas quem cadastrou precisa saber
  const avisoBling = await tentarSincronizarContato(cliente.id)

  // E-mail de convite — não bloqueia o cadastro se falhar, mas quem cadastrou
  // precisa saber, senão o cliente fica esperando um e-mail que não vem
  const envio = await enviarEmail({
    tipo: 'convite_acesso',
    destinatario: dados.email,
    assunto: 'Seu acesso ao portal Best Color Tecidos',
    html: templateConviteAcesso({
      nome: dados.contato || dados.razao_social,
      email: dados.email,
      senha,
      urlLogin: `${urlDoSite()}/login`,
    }),
  })

  await registrar({
    entidade: 'cliente',
    entidadeId: cliente.id,
    acao: 'criou',
    campos: [
      { campo: 'Razão social', de: null, para: dados.razao_social },
      { campo: 'Preço por metro', de: null, para: dados.preco_metro.toFixed(2) },
    ],
  })

  revalidatePath('/admin/clientes')
  return {
    ok: true,
    senha,
    avisoBling: avisoBling ?? undefined,
    avisoEmail: envio.ok ? undefined : envio.erro,
  }
}

export async function editarCliente(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaEditar.safeParse({
    id: formData.get('id'),
    ...lerCampos(formData),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const { id, ...dados } = parsed.data
  const admin = createAdminClient()

  // Lido antes para comparar depois: é o que vira a linha de auditoria
  const { data: atual } = await admin
    .from('clientes')
    .select(Object.keys(ROTULOS_CLIENTE).join(', '))
    .eq('id', id)
    .single<Record<string, unknown>>()

  if (!atual) return { ok: false, erro: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('clientes')
    .update({
      razao_social: dados.razao_social,
      cnpj: dados.cnpj,
      email: dados.email,
      contato: dados.contato || null,
      telefone: dados.telefone || null,
      inscricao_estadual: dados.inscricao_estadual || null,
      indicador_ie: dados.indicador_ie,
      cep: dados.cep || null,
      endereco: dados.endereco || null,
      numero: dados.numero || null,
      complemento: dados.complemento || null,
      bairro: dados.bairro || null,
      municipio: dados.municipio || null,
      uf: dados.uf || null,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Já existe outro cliente com este CNPJ.' }
    }
    return { ok: false, erro: 'Não foi possível salvar as alterações.' }
  }

  await registrar({
    entidade: 'cliente',
    entidadeId: id,
    acao: 'editou',
    campos: diferencas(atual, dados, ROTULOS_CLIENTE),
  })

  if (atual.email !== dados.email) {
    const { data: perfil } = await admin
      .from('profiles').select('id').eq('cliente_id', id).single()

    if (perfil) {
      const { error: erroAuth } = await admin.auth.admin.updateUserById(
        perfil.id,
        { email: dados.email, email_confirm: true }
      )
      if (erroAuth) {
        return {
          ok: false,
          erro: 'Dados salvos, mas o e-mail de acesso não pôde ser alterado. Ele já pode estar em uso.',
        }
      }
    }
  }

  // Toda alteração espelha no ERP. Falhar aqui não desfaz o salvamento: os
  // dados já estão certos no portal, mas quem editou precisa saber
  const avisoBling = await tentarSincronizarContato(id)

  revalidatePath('/admin/clientes')
  revalidatePath(`/admin/clientes/${id}`)
  return { ok: true, avisoBling: avisoBling ?? undefined }
}

export async function alternarClienteAtivo(
  clienteId: string,
  ativo: boolean
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('clientes').update({ ativo }).eq('id', clienteId)

  if (error) return { ok: false, erro: 'Não foi possível alterar o status.' }

  await admin.from('profiles').update({ ativo }).eq('cliente_id', clienteId)

  await registrar({
    entidade: 'cliente',
    entidadeId: clienteId,
    acao: ativo ? 'ativou' : 'desativou',
  })

  revalidatePath('/admin/clientes')
  return { ok: true }
}

/**
 * Manda ao cliente um link para criar a própria senha.
 *
 * Antes gerava uma senha provisória e mostrava na tela, para alguém da
 * equipe passar adiante. Isso punha a senha no WhatsApp de quem atende e no
 * e-mail em texto puro. O link é de uso único, vale uma hora e ninguém além
 * do cliente vê a senha que ele escolher.
 */
export async function redefinirSenha(
  clienteId: string
): Promise<{ ok: true; enviadoPara: string } | { ok: false; erro: string }> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('id, nome').eq('cliente_id', clienteId).single()

  if (!perfil) return { ok: false, erro: 'Acesso não encontrado.' }

  const { data: usuario } = await admin.auth.admin.getUserById(perfil.id)
  const email = usuario?.user?.email
  if (!email) return { ok: false, erro: 'Cliente sem e-mail de acesso.' }

  // O link é montado pelo portal, não pelo Bling nem pelo Supabase: o
  // `token_hash` entra no mesmo caminho que "esqueci minha senha" já usa
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  const tokenHash = link?.properties?.hashed_token
  if (error || !tokenHash) {
    return { ok: false, erro: 'Não foi possível gerar o link de redefinição.' }
  }

  const urlLink =
    `${urlDoSite()}/auth/confirmar?token_hash=${encodeURIComponent(tokenHash)}` +
    `&type=recovery&next=${encodeURIComponent('/nova-senha')}`

  const envio = await enviarEmail({
    tipo: 'redefinir_senha',
    destinatario: email,
    assunto: 'Crie uma nova senha para o portal Best Color Tecidos',
    html: templateRedefinirSenha({ nome: perfil.nome ?? 'cliente', email, urlLink }),
  })

  if (!envio.ok) {
    return { ok: false, erro: `O e-mail com o link não foi enviado (${envio.erro}).` }
  }

  await registrar({
    entidade: 'cliente',
    entidadeId: clienteId,
    acao: 'senha',
  })

  return { ok: true, enviadoPara: email }
}

/**
 * Atualiza o limite de crédito de um cliente, com motivo obrigatório.
 * A validação de permissão, motivo e auditoria acontecem dentro da
 * função `atualizar_limite_credito` no banco — aqui só repassamos.
 */
export async function atualizarLimiteCredito(
  clienteId: string,
  novoLimite: number,
  motivo: string
): Promise<Resultado> {
  const supabase = await createClient()

  const { data: antes } = await supabase
    .from('clientes').select('limite_credito').eq('id', clienteId).maybeSingle()

  const { error } = await supabase.rpc('atualizar_limite_credito', {
    p_cliente_id: clienteId,
    p_novo_limite: novoLimite,
    p_motivo: motivo,
  })

  if (error) return { ok: false, erro: error.message }

  // O banco já guarda isto em `cliente_limite_historico`, com autor e motivo.
  // Repetir aqui é de propósito: a tela do cliente mostra uma lista só, e ler
  // de duas tabelas para montá-la sairia mais caro que gravar duas vezes
  await registrar({
    entidade: 'cliente',
    entidadeId: clienteId,
    acao: 'editou',
    motivo,
    campos: [
      {
        campo: 'Limite de crédito',
        de: antes ? Number(antes.limite_credito).toFixed(2) : null,
        para: novoLimite.toFixed(2),
      },
    ],
  })

  revalidatePath('/admin/clientes')
  revalidatePath(`/admin/clientes/${clienteId}`)
  return { ok: true }
}

function gerarSenha(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}
export async function buscarResumoPagamentos() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('resumo_pagamentos_clientes')

  if (error) return {}

  const porCliente: Record<string, {
    pedidosComBoleto: number
    pagosEmDia: number
    pagosComAtraso: number
    vencidosNaoPagos: number
    valorVencido: number
    maiorAtrasoDias: number
  }> = {}

  ;(data ?? []).forEach((r: any) => {
    porCliente[r.cliente_id] = {
      pedidosComBoleto: r.pedidos_com_boleto,
      pagosEmDia: r.pagos_em_dia,
      pagosComAtraso: r.pagos_com_atraso,
      vencidosNaoPagos: r.vencidos_nao_pagos,
      valorVencido: Number(r.valor_vencido),
      maiorAtrasoDias: r.maior_atraso_dias,
    }
  })

  return porCliente
}

export async function buscarHistoricoPagamentos(clienteId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('historico_pagamentos_cliente', {
    p_cliente_id: clienteId,
  })

  if (error) return []

  return (data ?? []).map((p: any) => ({
    pedidoId: p.pedido_id,
    numero: p.numero_pedido,
    numeroParcela: p.numero_parcela as number | null,
    totalParcelas: p.total_parcelas as number | null,
    valor: Number(p.valor),
    vencimento: p.vencimento,
    pagoEm: p.pago_em,
    status: p.status as 'pago' | 'vencido' | 'aguardando',
    diasAtraso: p.dias_atraso,
  }))
}
export type ParcelaAReceber = {
  pedidoId: string
  numero: number
  clienteId: string
  clienteNome: string
  status: string
  formaPagamento: string
  numeroParcela: number | null
  totalParcelas: number | null
  valor: number
  vencimento: string | null
  pagoEm: string | null
  vencida: boolean
}

export async function buscarAguardandoRecebimento(): Promise<ParcelaAReceber[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('parcelas_a_receber')

  if (error) return []

  return (data ?? []).map((p: any) => ({
    pedidoId: p.pedido_id,
    numero: p.numero,
    clienteId: p.cliente_id,
    clienteNome: p.cliente_nome,
    status: p.status as string,
    formaPagamento: p.forma_pagamento as string,
    numeroParcela: p.numero_parcela as number | null,
    totalParcelas: p.total_parcelas as number | null,
    valor: Number(p.valor),
    vencimento: p.vencimento as string | null,
    pagoEm: p.pago_em as string | null,
    vencida: p.vencida as boolean,
  }))
}

export async function arquivarCliente(clienteId: string): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(clienteId)
  if (!parsed.success) return { ok: false, erro: 'Cliente inválido.' }

  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clientes').select('razao_social').eq('id', parsed.data).single()

  if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' }

  const { data: perfil } = await admin
    .from('profiles').select('id').eq('cliente_id', parsed.data).single()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let emailAnterior = ''
  let emailArquivado = ''

  if (perfil) {
    const { data: usuario } = await admin.auth.admin.getUserById(perfil.id)
    emailAnterior = usuario?.user?.email ?? ''

    if (emailAnterior) {
      const sufixo = parsed.data.slice(0, 8)
      emailArquivado = `arquivado+${sufixo}+${emailAnterior}`

      const { error: erroEmail } = await admin.auth.admin.updateUserById(perfil.id, {
        email: emailArquivado,
      })

      if (erroEmail) {
        return { ok: false, erro: 'Não foi possível liberar o e-mail.' }
      }
    }

    await admin.from('profiles').update({ ativo: false }).eq('id', perfil.id)
  }

  const { error } = await admin
    .from('clientes')
    .update({ ativo: false, arquivado: true })
    .eq('id', parsed.data)

  if (error) return { ok: false, erro: 'Não foi possível arquivar o cliente.' }

  if (emailAnterior) {
    await admin.from('cliente_arquivamento_historico').insert({
      cliente_id: parsed.data,
      razao_social: cliente.razao_social,
      email_anterior: emailAnterior,
      email_novo: emailArquivado,
      autor_id: user?.id,
    })
  }

  await registrar({
    entidade: 'cliente',
    entidadeId: parsed.data,
    acao: 'arquivou',
  })

  revalidatePath('/admin/clientes')
  return { ok: true }
}

/**
 * Preço por metro tem edição própria, ao lado do valor na tela do cliente.
 * É o campo que mais muda, e abrir o cadastro inteiro para trocar um número
 * expunha razão social, CNPJ e e-mail de acesso a alteração acidental.
 */
export async function atualizarPrecoMetro(
  clienteId: string,
  novoPreco: number
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.object({
    clienteId: z.string().uuid(),
    novoPreco: z.number().positive('Preço deve ser maior que zero').max(100000),
  }).safeParse({ clienteId, novoPreco })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const admin = createAdminClient()

  const { data: antes } = await admin
    .from('clientes')
    .select('preco_metro')
    .eq('id', parsed.data.clienteId)
    .maybeSingle()

  const { error } = await admin
    .from('clientes')
    .update({ preco_metro: parsed.data.novoPreco })
    .eq('id', parsed.data.clienteId)

  if (error) return { ok: false, erro: 'Não foi possível salvar o preço.' }

  await registrar({
    entidade: 'cliente',
    entidadeId: parsed.data.clienteId,
    acao: 'editou',
    campos: [
      {
        campo: 'Preço por metro',
        de: antes ? Number(antes.preco_metro).toFixed(2) : null,
        para: parsed.data.novoPreco.toFixed(2),
      },
    ],
  })

  revalidatePath('/admin/clientes')
  revalidatePath(`/admin/clientes/${parsed.data.clienteId}`)
  return { ok: true }
}
