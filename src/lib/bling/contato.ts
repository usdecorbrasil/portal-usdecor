import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarBling } from './cliente'

/**
 * Espelha o cliente do portal como contato no Bling.
 *
 * Roda no cadastro e em toda edição, e não na hora do pedido: quem está
 * mexendo no cliente está na frente da tela e pode corrigir o que faltar.
 * Descobrir que o contato está errado só quando o pedido fica pronto empurra o
 * problema para o pior momento.
 */

/** O Bling recusa acima de 3 requisições por segundo. */
const pausa = () => new Promise((r) => setTimeout(r, 400))

type Resultado =
  | { ok: true; id: number; acao: 'criado' | 'atualizado' | 'vinculado' }
  | { ok: false; erro: string }

type ClienteFiscal = {
  razao_social: string
  cnpj: string
  email: string | null
  telefone: string | null
  contato: string | null
  inscricao_estadual: string | null
  indicador_ie: number | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
  bling_contato_id: number | null
}

const CAMPOS =
  'razao_social, cnpj, email, telefone, contato, inscricao_estadual, ' +
  'indicador_ie, cep, endereco, numero, complemento, bairro, municipio, uf, ' +
  'bling_contato_id'

function primeiro(dados: unknown): Record<string, unknown> | null {
  const lista = (dados as { data?: unknown[] })?.data
  return Array.isArray(lista) && lista.length > 0
    ? (lista[0] as Record<string, unknown>)
    : null
}

/**
 * Monta o contato no formato do Bling.
 *
 * O endereço só é enviado quando há CEP e logradouro: mandar bloco vazio
 * apagaria um endereço que já exista no ERP.
 */
function corpoDoContato(c: ClienteFiscal) {
  const documento = String(c.cnpj ?? '').replace(/\D/g, '')
  // 14 dígitos é CNPJ (pessoa jurídica); 11 é CPF
  const tipo = documento.length > 11 ? 'J' : 'F'

  const corpo: Record<string, unknown> = {
    nome: c.razao_social,
    tipo,
    numeroDocumento: documento,
    situacao: 'A',
  }

  if (c.email) corpo.email = c.email
  if (c.telefone) corpo.telefone = c.telefone
  if (c.contato) corpo.fantasia = c.contato

  if (tipo === 'J') {
    // 1 contribuinte, 2 isento, 9 não contribuinte — sem isto o Bling recusa
    corpo.indicadorIe = c.indicador_ie ?? 9
    if (c.inscricao_estadual) corpo.ie = c.inscricao_estadual
  }

  const cep = String(c.cep ?? '').replace(/\D/g, '')

  if (cep && c.endereco) {
    corpo.endereco = {
      geral: {
        endereco: c.endereco,
        cep,
        bairro: c.bairro ?? '',
        municipio: c.municipio ?? '',
        uf: c.uf ?? '',
        numero: c.numero ?? '',
        complemento: c.complemento ?? '',
      },
    }
  }

  return corpo
}

async function lerCliente(clienteId: string): Promise<ClienteFiscal | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('clientes')
    .select(CAMPOS)
    .eq('id', clienteId)
    .maybeSingle()

  return (data as unknown as ClienteFiscal) ?? null
}

export async function sincronizarContatoComBling(
  clienteId: string
): Promise<Resultado> {
  const admin = createAdminClient()

  const cliente = await lerCliente(clienteId)
  if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' }

  const documento = String(cliente.cnpj ?? '').replace(/\D/g, '')
  if (!documento) return { ok: false, erro: 'Cliente sem CNPJ/CPF.' }

  const corpo = corpoDoContato(cliente)

  /* ---------------------------- já vinculado ---------------------------- */
  if (cliente.bling_contato_id) {
    const id = Number(cliente.bling_contato_id)

    // Lê antes de gravar: o PUT do Bling substitui o contato inteiro, e o ERP
    // costuma ter campos que o portal não conhece (vendedor, código, extras)
    const rAtual = await chamarBling(`/contatos/${id}`)

    if (!rAtual.ok) {
      return { ok: false, erro: `Falha ao ler contato no Bling: ${rAtual.erro.slice(0, 200)}` }
    }

    const atual = ((rAtual.dados as { data?: Record<string, unknown> })?.data ??
      {}) as Record<string, unknown>

    const mesclado: Record<string, unknown> = { ...atual, ...corpo }

    // O endereço é aninhado: sem mesclar, o bloco de cobrança se perderia
    if (corpo.endereco) {
      mesclado.endereco = {
        ...((atual.endereco as Record<string, unknown>) ?? {}),
        ...(corpo.endereco as Record<string, unknown>),
      }
    }

    delete mesclado.id

    await pausa()

    const rPut = await chamarBling(`/contatos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(mesclado),
    })

    if (!rPut.ok) {
      return { ok: false, erro: `Falha ao atualizar contato: ${rPut.erro.slice(0, 300)}` }
    }

    return { ok: true, id, acao: 'atualizado' }
  }

  /* --------------------- ainda sem vínculo: procura --------------------- */
  const rBusca = await chamarBling(
    `/contatos?numeroDocumento=${encodeURIComponent(documento)}`
  )

  if (!rBusca.ok) {
    return { ok: false, erro: `Falha ao consultar o Bling: ${rBusca.erro.slice(0, 200)}` }
  }

  const existente = primeiro(rBusca.dados)

  if (existente?.id) {
    // Guarda o vínculo e reaproveita o caminho de atualização, para o contato
    // do ERP receber os dados fiscais que o portal passou a ter
    await admin
      .from('clientes')
      .update({ bling_contato_id: existente.id })
      .eq('id', clienteId)

    await pausa()
    const r = await sincronizarContatoComBling(clienteId)
    return r.ok ? { ...r, acao: 'vinculado' } : r
  }

  await pausa()

  const rCriar = await chamarBling('/contatos', {
    method: 'POST',
    body: JSON.stringify(corpo),
  })

  if (!rCriar.ok) {
    return { ok: false, erro: `Falha ao criar contato: ${rCriar.erro.slice(0, 300)}` }
  }

  const criado = (rCriar.dados as { data?: { id?: number } })?.data

  if (!criado?.id) {
    return { ok: false, erro: 'O Bling aceitou a chamada mas não devolveu o id do contato.' }
  }

  await admin
    .from('clientes')
    .update({ bling_contato_id: criado.id })
    .eq('id', clienteId)

  return { ok: true, id: criado.id, acao: 'criado' }
}

/**
 * Versão que nunca lança e devolve só o aviso, para o cadastro ou a edição do
 * cliente não serem desfeitos por causa do ERP.
 */
export async function tentarSincronizarContato(
  clienteId: string
): Promise<string | null> {
  try {
    const r = await sincronizarContatoComBling(clienteId)
    return r.ok ? null : r.erro
  } catch (e) {
    return e instanceof Error ? e.message : 'Erro desconhecido ao falar com o Bling.'
  }
}

/* --------------------------- limite de crédito --------------------------- */

/**
 * O limite de crédito é controlado só no portal (decisão do dono, 09/10/2026).
 * O cadastro do contato no Bling tem um limite próprio, que soma tudo o que o
 * Bling tem em aberto para o cliente — inclusive contas que o portal não
 * conhece — e recusa o pedido de venda quando passa. Foi o que barrou o #1025.
 *
 * Esta função tira esse limite do contato: lê, mescla e grava com
 * `financeiro.limiteCredito = 0` — segundo o próprio Bling, zero no campo é
 * tratado como sem limite (a opção "Limite zero" da tela seria outra marcação).
 * Não deu para confirmar na documentação da API; se a conta tratar diferente,
 * a segunda tentativa do pedido falha e a mensagem manda marcar "Limite
 * ilimitado" no contato. Só é chamada quando o Bling já recusou por limite —
 * cliente que hoje fatura normalmente não é tocado.
 * Devolve o limite que estava lá, para a auditoria.
 */
export async function liberarLimiteNoBling(
  contatoId: number
): Promise<{ ok: true; antes: number | null } | { ok: false; erro: string }> {
  const rAtual = await chamarBling(`/contatos/${contatoId}`)
  if (!rAtual.ok) return { ok: false, erro: `Falha ao ler contato no Bling: ${rAtual.erro.slice(0, 200)}` }

  const atual = ((rAtual.dados as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>
  const financeiro = (atual.financeiro as Record<string, unknown> | undefined) ?? {}
  const antes = typeof financeiro.limiteCredito === 'number' ? financeiro.limiteCredito : null

  const mesclado: Record<string, unknown> = { ...atual, financeiro: { ...financeiro, limiteCredito: 0 } }
  delete mesclado.id

  await pausa()
  const rPut = await chamarBling(`/contatos/${contatoId}`, { method: 'PUT', body: JSON.stringify(mesclado) })
  if (!rPut.ok) return { ok: false, erro: `Falha ao tirar o limite do contato no Bling: ${rPut.erro.slice(0, 300)}` }

  return { ok: true, antes }
}

