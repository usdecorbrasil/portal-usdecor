'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateConviteAcesso } from '@/lib/resend/templates/convite-acesso'

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
  preco_metro: precoBr,
}

const schemaCriar = z.object(camposBase)
const schemaEditar = z.object({ id: z.string().uuid(), ...camposBase })

type ResultadoCriar = { ok: true; senha: string } | { ok: false; erro: string }
type Resultado = { ok: true } | { ok: false; erro: string }

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

  // E-mail de convite — não bloqueia o cadastro se falhar
  await enviarEmail({
    tipo: 'convite_acesso',
    destinatario: dados.email,
    assunto: 'Seu acesso ao portal Bello Tecido',
    html: templateConviteAcesso({
      nome: dados.contato || dados.razao_social,
      email: dados.email,
      senha,
      urlLogin: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
    }),
  })

  revalidatePath('/admin/clientes')
  return { ok: true, senha }
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

  const { data: atual } = await admin
    .from('clientes').select('email').eq('id', id).single()

  if (!atual) return { ok: false, erro: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('clientes')
    .update({
      razao_social: dados.razao_social,
      cnpj: dados.cnpj,
      email: dados.email,
      contato: dados.contato || null,
      telefone: dados.telefone || null,
      preco_metro: dados.preco_metro,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Já existe outro cliente com este CNPJ.' }
    }
    return { ok: false, erro: 'Não foi possível salvar as alterações.' }
  }

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

  revalidatePath('/admin/clientes')
  return { ok: true }
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

  revalidatePath('/admin/clientes')
  return { ok: true }
}

export async function redefinirSenha(
  clienteId: string
): Promise<{ ok: true; senha: string } | { ok: false; erro: string }> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('id').eq('cliente_id', clienteId).single()

  if (!perfil) return { ok: false, erro: 'Acesso não encontrado.' }

  const senha = gerarSenha()

  const { error } = await admin.auth.admin.updateUserById(perfil.id, {
    password: senha,
  })

  if (error) return { ok: false, erro: 'Não foi possível redefinir a senha.' }

  return { ok: true, senha }
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

  const { error } = await supabase.rpc('atualizar_limite_credito', {
    p_cliente_id: clienteId,
    p_novo_limite: novoLimite,
    p_motivo: motivo,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/admin/clientes')
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
export async function buscarAguardandoRecebimento() {
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

  revalidatePath('/admin/clientes')
  return { ok: true }
}