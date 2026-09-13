import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { chamarBling } from './cliente'

/**
 * Espelha o cliente do portal como contato no Bling.
 *
 * Roda no cadastro do cliente, e não na hora do pedido, por um motivo prático:
 * quem cadastra está na frente da tela e pode corrigir o que faltar. Descobrir
 * que o contato não existe só quando o pedido fica pronto — que era o
 * comportamento anterior — empurra o problema para o pior momento.
 *
 * Nunca sobrescreve um contato existente: se já houver alguém com o mesmo
 * documento no Bling, apenas guarda o vínculo. Cliente cadastrado no ERP
 * costuma ter endereço, inscrição estadual e histórico que o portal não tem.
 */

type Resultado = { ok: true; id: number; criado: boolean } | { ok: false; erro: string }

function primeiro(dados: unknown): Record<string, unknown> | null {
  const lista = (dados as { data?: unknown[] })?.data
  return Array.isArray(lista) && lista.length > 0
    ? (lista[0] as Record<string, unknown>)
    : null
}

export async function sincronizarContatoComBling(
  clienteId: string
): Promise<Resultado> {
  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clientes')
    .select('razao_social, cnpj, email, telefone, contato, bling_contato_id')
    .eq('id', clienteId)
    .maybeSingle()

  if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' }

  if (cliente.bling_contato_id) {
    return { ok: true, id: Number(cliente.bling_contato_id), criado: false }
  }

  const documento = String(cliente.cnpj ?? '').replace(/\D/g, '')
  if (!documento) return { ok: false, erro: 'Cliente sem CNPJ/CPF.' }

  /* ---- já existe no Bling? então só guarda o vínculo ---- */
  const rBusca = await chamarBling(
    `/contatos?numeroDocumento=${encodeURIComponent(documento)}`
  )

  if (!rBusca.ok) {
    return { ok: false, erro: `Falha ao consultar o Bling: ${rBusca.erro.slice(0, 200)}` }
  }

  const existente = primeiro(rBusca.dados)

  if (existente?.id) {
    await admin
      .from('clientes')
      .update({ bling_contato_id: existente.id })
      .eq('id', clienteId)

    return { ok: true, id: Number(existente.id), criado: false }
  }

  /* ---- não existe: cria ---- */
  // 14 dígitos é CNPJ (pessoa jurídica); 11 é CPF
  const tipo = documento.length > 11 ? 'J' : 'F'

  const corpo: Record<string, unknown> = {
    nome: cliente.razao_social,
    tipo,
    numeroDocumento: documento,
    situacao: 'A',
    // "Não contribuinte": o portal não guarda inscrição estadual, e sem este
    // campo o Bling recusa pessoa jurídica
    ...(tipo === 'J' ? { indicadorIe: 9 } : {}),
  }

  if (cliente.email) corpo.email = cliente.email
  if (cliente.telefone) corpo.telefone = cliente.telefone
  if (cliente.contato) corpo.fantasia = cliente.contato

  // O Bling recusa acima de 3 requisições por segundo
  await new Promise((r) => setTimeout(r, 400))

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

  return { ok: true, id: criado.id, criado: true }
}

/**
 * Versão que nunca lança e devolve só o aviso, para o cadastro do cliente
 * não ser desfeito por causa do ERP.
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
