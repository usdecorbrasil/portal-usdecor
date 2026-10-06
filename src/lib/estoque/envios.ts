import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { urlDocumento } from '@/lib/storage/documentos'
import type { EnvioLinha } from '@/components/envios-tecido'
import type { SituacaoEnvio } from './tipos'

/**
 * Envios de tecido prontos para a lista — do cliente logado (as políticas
 * filtram) ou, para a equipe, de um cliente ou de todos. O link da NF é
 * assinado aqui, no servidor, porque o bucket é privado.
 */
export async function listarEnvios(opts: { clienteId?: string; limite?: number } = {}): Promise<EnvioLinha[]> {
  const supabase = await createClient()

  let q = supabase
    .from('tecido_envios')
    .select(
      'id, metros_informados, metros_conferidos, nf_numero, nf_caminho, observacao, observacao_conferencia, situacao, criado_em, conferido_em, conferido_por, clientes(razao_social), tecidos(nome)'
    )
    .order('criado_em', { ascending: false })
    .limit(opts.limite ?? 100)
  if (opts.clienteId) q = q.eq('cliente_id', opts.clienteId)

  const { data } = await q
  const linhas = (data ?? []) as unknown as {
    id: string
    metros_informados: number
    metros_conferidos: number | null
    nf_numero: string | null
    nf_caminho: string | null
    observacao: string | null
    observacao_conferencia: string | null
    situacao: SituacaoEnvio
    criado_em: string
    conferido_em: string | null
    conferido_por: string | null
    clientes: { razao_social: string } | null
    tecidos: { nome: string } | null
  }[]

  const autores = [...new Set(linhas.map((l) => l.conferido_por).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (autores.length) {
    const { data: perfis } = await supabase.from('profiles').select('id, nome').in('id', autores)
    perfis?.forEach((p) => p.nome && nomes.set(p.id as string, p.nome as string))
  }

  return Promise.all(
    linhas.map(async (l) => ({
      id: l.id,
      cliente: l.clientes?.razao_social ?? '—',
      tecido: l.tecidos?.nome ?? '—',
      metrosInformados: Number(l.metros_informados),
      metrosConferidos: l.metros_conferidos != null ? Number(l.metros_conferidos) : null,
      nfNumero: l.nf_numero,
      nfUrl: await urlDocumento(l.nf_caminho),
      observacao: l.observacao,
      observacaoConferencia: l.observacao_conferencia,
      situacao: l.situacao,
      criadoEm: l.criado_em,
      conferidoEm: l.conferido_em,
      conferidoPor: l.conferido_por ? nomes.get(l.conferido_por) ?? null : null,
    }))
  )
}
