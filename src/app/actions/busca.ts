'use server'

import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'

/**
 * O termo entra no filtro `.or()` do PostgREST, onde vírgula e parênteses
 * separam condições e aspas/barra mudam a leitura: sem limpar, quem digita
 * "x,preco_unitario.gt.0" acrescenta um filtro próprio. Tira esses
 * caracteres e limita o tamanho.
 */
function limparTermo(termo: string): string {
  return termo.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

const ROTULOS_STATUS: Record<string, string> = {
  aguardando: 'Aguardando confirmação',
  recebido: 'Pedido confirmado',
  impressao: 'Impressão',
  estampando: 'Estampando',
  corte_costura: 'Em corte / costura',
  pronto: 'Estampa pronta',
  nf_emitida: 'Nota fiscal emitida',
  expedido: 'Expedido',
  entregue: 'Entregue',
  fechado: 'Pedido fechado',
}

/** Status vem do último registro do histórico, não de uma coluna */
function statusAtual(historico: { status: string; created_at: string }[]) {
  const ultimo = (historico ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
  return ultimo?.status ?? 'aguardando'
}

export type ResultadoBusca = {
  pedidos: {
    id: string
    numero: number
    clienteNome: string
    total: number | null
    status: string
    statusLabel: string
    emAndamento: boolean
  }[]
  clientes: {
    id: string
    razaoSocial: string
    cnpj: string
    email: string
  }[]
  artes: {
    id: string
    sku: string
    nome: string
    catalogoId: string
    clienteNome: string
  }[]
  /** Há mais resultados além dos exibidos, por segmento */
  temMais: { pedidos: boolean; clientes: boolean; artes: boolean }
}

export async function buscarGeral(
  termo: string,
  limite = 3
): Promise<ResultadoBusca> {
  const perfil = await lerPerfil()

  const vazio: ResultadoBusca = {
    pedidos: [],
    clientes: [],
    artes: [],
    temMais: { pedidos: false, clientes: false, artes: false },
  }

  if (!perfil || perfil.papel === 'cliente') return vazio

  const termoLimpo = limparTermo(termo)
  if (termoLimpo.length < 2) return vazio

  const supabase = await createClient()
  const veValores = perfil.veValores

  // Busca um a mais que o limite para saber se existe "ver mais"
  const teto = limite + 1

  const campos =
    'id, numero, total, created_at, clientes(razao_social), pedido_status_historico(status, created_at)'

  // Itens casam por SKU ou nome da arte: leva ao pedido que os contém
  const { data: itens } = await supabase
    .from('pedido_itens')
    .select('pedido_id')
    .or(`sku.ilike.%${termoLimpo}%,nome.ilike.%${termoLimpo}%`)
    .limit(50)

  const idsPorItem = [...new Set((itens ?? []).map((i) => i.pedido_id))]

  const [porNumero, porCliente, porItem, clientesRes, artesRes] =
    await Promise.all([
      supabase
        .from('pedidos')
        .select(campos)
        .eq('numero', Number(termoLimpo) || 0)
        .is('cancelado_em', null)
        .limit(teto),

      // Nome do cliente: digitar "Acme" traz os pedidos da Acme
      supabase
        .from('pedidos')
        .select(
          'id, numero, total, created_at, clientes!inner(razao_social), pedido_status_historico(status, created_at)'
        )
        .ilike('clientes.razao_social', `%${termoLimpo}%`)
        .is('cancelado_em', null)
        .order('created_at', { ascending: false })
        .limit(teto),

      idsPorItem.length
        ? supabase
            .from('pedidos')
            .select(campos)
            .in('id', idsPorItem)
            .is('cancelado_em', null)
            .order('created_at', { ascending: false })
            .limit(teto)
        : Promise.resolve({ data: [] }),

      supabase
        .from('clientes')
        .select('id, razao_social, cnpj, email')
        .or(
          `razao_social.ilike.%${termoLimpo}%,cnpj.ilike.%${termoLimpo}%,` +
            `email.ilike.%${termoLimpo}%,contato.ilike.%${termoLimpo}%,` +
            `telefone.ilike.%${termoLimpo}%`
        )
        .limit(teto),

      supabase
        .from('produtos')
        .select('id, sku, nome, catalogo_id, clientes(razao_social)')
        .or(`sku.ilike.%${termoLimpo}%,nome.ilike.%${termoLimpo}%`)
        .limit(teto),
    ])

  // O mesmo pedido pode casar por número, cliente e item
  const porId = new Map<string, any>()
  for (const p of [
    ...(porNumero.data ?? []),
    ...(porCliente.data ?? []),
    ...((porItem.data ?? []) as any[]),
  ]) {
    if (!porId.has((p as any).id)) porId.set((p as any).id, p)
  }

  const todosPedidos = [...porId.values()]
    .map((p: any) => {
      const status = statusAtual(p.pedido_status_historico)
      return {
        id: p.id,
        numero: Number(p.numero),
        clienteNome: p.clientes?.razao_social ?? '—',
        total: veValores ? Number(p.total) : null,
        status,
        statusLabel: ROTULOS_STATUS[status] ?? status,
        emAndamento: status !== 'fechado',
      }
    })
    // Pedidos em andamento primeiro: são os que exigem ação
    .sort((a, b) => Number(b.emAndamento) - Number(a.emAndamento))

  const todosClientes = (clientesRes.data ?? []).map((c) => ({
    id: c.id,
    razaoSocial: c.razao_social,
    cnpj: c.cnpj,
    email: c.email,
  }))

  const todasArtes = (artesRes.data ?? []).map((a: any) => ({
    id: a.id,
    sku: a.sku,
    nome: a.nome,
    catalogoId: a.catalogo_id,
    clienteNome: a.clientes?.razao_social ?? '—',
  }))

  return {
    pedidos: todosPedidos.slice(0, limite),
    clientes: todosClientes.slice(0, limite),
    artes: todasArtes.slice(0, limite),
    temMais: {
      pedidos: todosPedidos.length > limite,
      clientes: todosClientes.length > limite,
      artes: todasArtes.length > limite,
    },
  }
}
export type ResultadoBuscaCliente = {
  pedidos: {
    id: string
    numero: number
    total: number
  }[]
  artes: {
    id: string
    sku: string
    nome: string
    catalogoId: string
  }[]
}

export async function buscarGeralCliente(termo: string): Promise<ResultadoBuscaCliente> {
  const perfil = await lerPerfil()
  const vazio: ResultadoBuscaCliente = { pedidos: [], artes: [] }

  if (!perfil || perfil.papel !== 'cliente' || !perfil.clienteId) return vazio

  const termoLimpo = limparTermo(termo)
  if (termoLimpo.length < 2) return vazio

  const supabase = await createClient()

  const [pedidosRes, artesRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero, total')
      .eq('cliente_id', perfil.clienteId)
      .eq('numero', Number(termoLimpo) || 0)
      .limit(10),

    supabase
      .from('produtos')
      .select('id, sku, nome, catalogo_id')
      .eq('cliente_id', perfil.clienteId)
      .eq('ativo', true)
      .or(`sku.ilike.%${termoLimpo}%,nome.ilike.%${termoLimpo}%`)
      .limit(10),
  ])

  return {
    pedidos: (pedidosRes.data ?? []).map((p) => ({
      id: p.id,
      numero: Number(p.numero),
      total: Number(p.total),
    })),
    artes: (artesRes.data ?? []).map((a) => ({
      id: a.id,
      sku: a.sku,
      nome: a.nome,
      catalogoId: a.catalogo_id,
    })),
  }
}