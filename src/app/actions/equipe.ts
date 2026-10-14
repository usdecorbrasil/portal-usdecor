'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEmail } from '@/lib/resend/enviar'
import { templateConviteAcesso } from '@/lib/resend/templates/convite-acesso'
import { templateRedefinirSenha } from '@/lib/resend/templates/redefinir-senha'
import { urlDoSite } from '@/lib/site'
import { registrar, diferencas, ROTULOS_EQUIPE } from '@/lib/auditoria'

type Resultado = { ok: true } | { ok: false; erro: string }
/** `avisoEmail` vem preenchido quando a senha existe mas o e-mail não saiu. */
type ComSenha =
  | { ok: true; senha: string; avisoEmail?: string }
  | { ok: false; erro: string }

/** Admin e financeiro administram a equipe */
async function exigirDono() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  if (!perfil?.ativo || (perfil.role !== 'admin' && perfil.role !== 'financeiro')) return null
  return user.id
}

function gerarSenha(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export async function criarMembro(
  _prev: unknown,
  formData: FormData
): Promise<ComSenha> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.object({
    nome: z.string().trim().min(2, 'Informe o nome').max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
    papel: z.enum(['admin', 'funcionario', 'financeiro']),
  }).safeParse({
    nome: formData.get('nome'),
    email: formData.get('email'),
    papel: formData.get('papel'),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const { nome, email, papel } = parsed.data
  const admin = createAdminClient()
  const senha = gerarSenha()

  const { data: novo, error: erroUser } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    // Senha gerada aqui e enviada por e-mail: vale só até o primeiro acesso
    app_metadata: { senha_provisoria: true },
  })

  if (erroUser || !novo.user) {
    return {
      ok: false,
      erro: erroUser?.message.includes('already')
        ? 'Este e-mail já tem acesso ao portal.'
        : 'Não foi possível criar o acesso.',
    }
  }

  const { error: erroPerfil } = await admin.from('profiles').insert({
    id: novo.user.id,
    role: papel,
    cliente_id: null,
    nome,
  })

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(novo.user.id)
    return { ok: false, erro: 'Não foi possível vincular o acesso.' }
  }

  // E-mail de convite — não bloqueia o cadastro se falhar, mas quem cadastrou
  // precisa saber, senão a pessoa fica esperando um e-mail que não vem
  const envio = await enviarEmail({
    tipo: 'convite_acesso',
    destinatario: email,
    assunto: 'Seu acesso ao portal US Decor',
    html: templateConviteAcesso({
      nome,
      email,
      senha,
      urlLogin: `${urlDoSite()}/login`,
    }),
  })

  await registrar({
    entidade: 'equipe',
    entidadeId: novo.user.id,
    acao: 'criou',
    campos: [
      { campo: 'Nome', de: null, para: nome },
      { campo: 'E-mail de acesso', de: null, para: email },
      { campo: 'Papel', de: null, para: papel },
    ],
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true, senha, avisoEmail: envio.ok ? undefined : envio.erro }
}

/**
 * Manda ao membro um link para criar a própria senha — mesmo modelo do
 * cliente. Ninguém vê nem transporta a senha; o link é de uso único e vale
 * uma hora.
 */
export async function redefinirSenhaMembro(
  usuarioId: string
): Promise<{ ok: true; enviadoPara: string } | { ok: false; erro: string }> {
  if (!(await exigirDono())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(usuarioId)
  if (!parsed.success) return { ok: false, erro: 'Usuário inválido.' }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('role, nome').eq('id', parsed.data).single()

  if (!perfil || perfil.role === 'cliente') {
    return { ok: false, erro: 'Usuário não é da equipe.' }
  }

  const { data: usuario } = await admin.auth.admin.getUserById(parsed.data)
  const email = usuario?.user?.email
  if (!email) return { ok: false, erro: 'Usuário sem e-mail cadastrado.' }

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
    assunto: 'Crie uma nova senha para o portal US Decor',
    html: templateRedefinirSenha({ nome: perfil.nome ?? 'usuário', email, urlLink }),
  })

  if (!envio.ok) {
    return { ok: false, erro: `O e-mail com o link não foi enviado (${envio.erro}).` }
  }

  await registrar({
    entidade: 'equipe',
    entidadeId: parsed.data,
    acao: 'senha',
  })

  return { ok: true, enviadoPara: email }
}

/**
 * Substitui o antigo `alterarPapel` (toggle binário).
 * Edita nome, e-mail e papel de um membro da equipe, de uma vez só.
 */
export async function atualizarMembro(
  usuarioId: string,
  dados: { nome: string; email: string; papel: 'admin' | 'funcionario' | 'financeiro' }
): Promise<Resultado> {
  const meuId = await exigirDono()
  if (!meuId) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.object({
    usuarioId: z.string().uuid(),
    nome: z.string().trim().min(2, 'Informe o nome').max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
    papel: z.enum(['admin', 'funcionario', 'financeiro']),
  }).safeParse({ usuarioId, ...dados })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  // Não rebaixar a si mesmo — evita ficar sem ninguém administrando.
  // `financeiro` conta: tem exatamente o mesmo acesso que `admin`, e exigir
  // `admin` aqui travava a edição do próprio cadastro de quem é financeiro
  if (parsed.data.usuarioId === meuId && parsed.data.papel === 'funcionario') {
    return {
      ok: false,
      erro: 'Você não pode rebaixar o próprio acesso a funcionário.',
    }
  }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('role, nome').eq('id', parsed.data.usuarioId).single()

  if (!perfil || perfil.role === 'cliente') {
    return { ok: false, erro: 'Usuário não é da equipe.' }
  }

  const { data: usuarioAntes } = await admin.auth.admin.getUserById(
    parsed.data.usuarioId
  )

  // Atualiza e-mail em auth.users
  const { error: erroEmail } = await admin.auth.admin.updateUserById(
    parsed.data.usuarioId,
    { email: parsed.data.email }
  )

  if (erroEmail) {
    return {
      ok: false,
      erro: erroEmail.message.includes('already')
        ? 'Este e-mail já está em uso por outra conta.'
        : `Não foi possível atualizar o e-mail: ${erroEmail.message} (status ${erroEmail.status}, code ${erroEmail.code})`,
    }
  }

  // Atualiza nome e papel em profiles
  const { error: erroPerfil } = await admin
    .from('profiles')
    .update({ nome: parsed.data.nome, role: parsed.data.papel })
    .eq('id', parsed.data.usuarioId)

  if (erroPerfil) {
    return { ok: false, erro: 'Não foi possível salvar as alterações.' }
  }

  await registrar({
    entidade: 'equipe',
    entidadeId: parsed.data.usuarioId,
    acao: 'editou',
    campos: diferencas(
      {
        nome: perfil.nome,
        email: usuarioAntes?.user?.email,
        role: perfil.role,
      },
      {
        nome: parsed.data.nome,
        email: parsed.data.email,
        role: parsed.data.papel,
      },
      ROTULOS_EQUIPE
    ),
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}

export async function alternarMembroAtivo(
  usuarioId: string,
  ativo: boolean
): Promise<Resultado> {
  const meuId = await exigirDono()
  if (!meuId) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(usuarioId)
  if (!parsed.success) return { ok: false, erro: 'Usuário inválido.' }

  // Não desativar a si mesmo
  if (parsed.data === meuId && !ativo) {
    return { ok: false, erro: 'Você não pode desativar o próprio acesso.' }
  }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('role').eq('id', parsed.data).single()

  if (!perfil || perfil.role === 'cliente') {
    return { ok: false, erro: 'Usuário não é da equipe.' }
  }

  const { error } = await admin
    .from('profiles').update({ ativo }).eq('id', parsed.data)

  if (error) return { ok: false, erro: 'Não foi possível alterar o status.' }

  await registrar({
    entidade: 'equipe',
    entidadeId: parsed.data,
    acao: ativo ? 'ativou' : 'desativou',
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}

export async function arquivarMembro(usuarioId: string): Promise<Resultado> {
  const meuId = await exigirDono()
  if (!meuId) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(usuarioId)
  if (!parsed.success) return { ok: false, erro: 'Usuário inválido.' }

  if (parsed.data === meuId) {
    return { ok: false, erro: 'Você não pode arquivar o próprio acesso.' }
  }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('role, nome').eq('id', parsed.data).single()

  if (!perfil || perfil.role === 'cliente') {
    return { ok: false, erro: 'Usuário não é da equipe.' }
  }

  const { data: usuario } = await admin.auth.admin.getUserById(parsed.data)
  const emailAtual = usuario?.user?.email

  if (!emailAtual) {
    return { ok: false, erro: 'E-mail do usuário não encontrado.' }
  }

  const sufixo = parsed.data.slice(0, 8)
  const emailArquivado = `arquivado+${sufixo}+${emailAtual}`

  const { error: erroEmail } = await admin.auth.admin.updateUserById(parsed.data, {
    email: emailArquivado,
  })

  if (erroEmail) {
    return { ok: false, erro: 'Não foi possível liberar o e-mail.' }
  }

  const { error: erroPerfil } = await admin
    .from('profiles').update({ ativo: false, arquivado: true }).eq('id', parsed.data)

  if (erroPerfil) {
    return { ok: false, erro: 'Não foi possível arquivar o acesso.' }
  }

  await admin.from('membro_arquivamento_historico').insert({
    usuario_id: parsed.data,
    nome: perfil.nome ?? '—',
    email_anterior: emailAtual,
    email_novo: emailArquivado,
    autor_id: meuId,
  })

  await registrar({
    entidade: 'equipe',
    entidadeId: parsed.data,
    acao: 'arquivou',
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}

export async function restaurarMembro(usuarioId: string): Promise<Resultado> {
  const meuId = await exigirDono()
  if (!meuId) return { ok: false, erro: 'Acesso negado.' }

  const parsed = z.string().uuid().safeParse(usuarioId)
  if (!parsed.success) return { ok: false, erro: 'Usuário inválido.' }

  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('profiles').select('arquivado').eq('id', parsed.data).single()

  if (!perfil?.arquivado) {
    return { ok: false, erro: 'Este usuário não está arquivado.' }
  }

  const { data: usuario } = await admin.auth.admin.getUserById(parsed.data)
  const emailAtual = usuario?.user?.email

  if (!emailAtual) {
    return { ok: false, erro: 'E-mail do usuário não encontrado.' }
  }

  const emailOriginal = emailAtual.replace(/^arquivado\+[^+]+\+/, '')

  if (emailOriginal === emailAtual) {
    return { ok: false, erro: 'Não foi possível identificar o e-mail original.' }
  }

  const { error: erroEmail } = await admin.auth.admin.updateUserById(parsed.data, {
    email: emailOriginal,
  })

  if (erroEmail) {
    return {
      ok: false,
      erro: `Não foi possível restaurar o e-mail (${emailOriginal}): ${erroEmail.message} (status ${erroEmail.status}, code ${erroEmail.code})`,
    }
  }

  const { error: erroPerfil } = await admin
    .from('profiles').update({ ativo: true, arquivado: false }).eq('id', parsed.data)

  if (erroPerfil) {
    return { ok: false, erro: 'Não foi possível restaurar o acesso.' }
  }

  await registrar({
    entidade: 'equipe',
    entidadeId: parsed.data,
    acao: 'restaurou',
  })

  revalidatePath('/admin/configuracoes')
  return { ok: true }
}