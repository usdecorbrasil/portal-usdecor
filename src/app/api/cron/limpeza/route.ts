import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Limpeza diária do armazenamento (chamada pelo workflow avisos-diarios.yml).
 *
 * Notas de despesa (bucket `despesas`): apaga fotos/PDFs com mais de 15
 *    dias que nenhuma nota usa — sobem na leitura (lerDespesa) e ficam órfãos
 *    quando a pessoa desiste antes de salvar. Nota excluída continua com o
 *    arquivo (a exclusão é lógica).
 *
 * `?simular=1` só conta, sem apagar. Sem segredo, 401.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Prazo mínimo antes de apagar qualquer arquivo (pedido do dono, 09/10/2026). */
const PRAZO_MINIMO_DIAS = 15
const PRAZO_ORFAO_MS = PRAZO_MINIMO_DIAS * 24 * 60 * 60 * 1000
const LOTE = 100

function autorizado(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  return request.headers.get('authorization') === `Bearer ${segredo}`
}

function mesesRecentes(agora: Date, quantos: number): string[] {
  const meses: string[] = []
  for (let i = 0; i < quantos; i++) {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1))
    meses.push(d.toISOString().slice(0, 7))
  }
  return meses
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  const simular = request.nextUrl.searchParams.get('simular') === '1'
  const admin = createAdminClient()
  const agora = new Date()
  const resumo = { simulacao: simular, despesas: { verificados: 0, orfaos: 0 }, erros: [] as string[] }

  // ------------------------------------------------------------- despesas
  // Arquivos ficam em AAAA-MM/uuid.ext; olha os 3 meses mais recentes
  // (com 15 dias de prazo, um arquivo órfão sempre cai dentro deles)
  const { data: usados, error: erroUsados } = await admin
    .from('despesas')
    .select('arquivo_path')
    .not('arquivo_path', 'is', null)
  if (erroUsados) {
    resumo.erros.push(`despesas: ${erroUsados.message}`)
  } else {
    const emUso = new Set((usados ?? []).map((d) => d.arquivo_path as string))
    const orfaos: string[] = []
    for (const mes of mesesRecentes(agora, 3)) {
      const { data: objetos, error } = await admin.storage.from('despesas').list(mes, { limit: 1000 })
      if (error) {
        resumo.erros.push(`despesas ${mes}: ${error.message}`)
        continue
      }
      for (const o of objetos ?? []) {
        if (!o.id) continue // subpasta
        const caminho = `${mes}/${o.name}`
        resumo.despesas.verificados++
        const criado = new Date(o.created_at ?? agora.toISOString()).getTime()
        if (!emUso.has(caminho) && agora.getTime() - criado > PRAZO_ORFAO_MS) orfaos.push(caminho)
      }
    }
    resumo.despesas.orfaos = orfaos.length
    if (!simular) {
      for (let i = 0; i < orfaos.length; i += LOTE) {
        const { error } = await admin.storage.from('despesas').remove(orfaos.slice(i, i + LOTE))
        if (error) resumo.erros.push(`despesas: ${error.message}`)
      }
    }
  }

  return NextResponse.json({ ok: resumo.erros.length === 0, ...resumo }, { status: resumo.erros.length ? 500 : 200 })
}
