'use server'

import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'

export type ResultadoBusca = {
  pedidos: {
    id: string
    numero: number
    clienteNome: string
    total: number | null
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
}

export async function buscarGeral(termo: string): Promise<ResultadoBusca> {
  const perfil = await lerPerfil()

  const vazio: ResultadoBusca = { pedidos: [], clientes: [], artes: [] }

  if (!perfil || perfil.papel === 'cliente') return vazio

  const termoLimpo = termo.trim()
  if (termoLimpo.length < 2) return vazio

  const supabase = await createClient()
  const veValores = perfil.veValores

  const [pedidosRes, clientesRes, artesRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero, total, clientes(razao_social)')
      .or(`numero.eq.${Number(termoLimpo) || 0}`)
      .limit(10),

    supabase
      .from('clientes')
      .select('id, razao_social, cnpj, email')
      .or(
        `razao_social.ilike.%${termoLimpo}%,cnpj.ilike.%${termoLimpo}%,email.ilike.%${termoLimpo}%`
      )
      .limit(10),

    supabase
      .from('produtos')
      .select('id, sku, nome, catalogo_id, clientes(razao_social)')
      .or(`sku.ilike.%${termoLimpo}%,nome.ilike.%${termoLimpo}%`)
      .limit(10),
  ])

  return {
    pedidos: (pedidosRes.data ?? []).map((p: any) => ({
      id: p.id,
      numero: Number(p.numero),
      clienteNome: p.clientes?.razao_social ?? '—',
      total: veValores ? Number(p.total) : null,
    })),
    clientes: (clientesRes.data ?? []).map((c) => ({
      id: c.id,
      razaoSocial: c.razao_social,
      cnpj: c.cnpj,
      email: c.email,
    })),
    artes: (artesRes.data ?? []).map((a: any) => ({
      id: a.id,
      sku: a.sku,
      nome: a.nome,
      catalogoId: a.catalogo_id,
      clienteNome: a.clientes?.razao_social ?? '—',
    })),
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

  const termoLimpo = termo.trim()
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