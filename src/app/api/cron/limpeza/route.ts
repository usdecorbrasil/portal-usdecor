import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Limpeza diária do armazenamento (chamada pelo workflow avisos-diarios.yml).
 *
 * Nunca toca nas imagens do catálogo (bucket `artes`).
 *
 * 1. Artes enviadas pelos clientes (bucket `envios-arte`): apaga os arquivos
 *    dos envios cujo `arquivos_expiram_em` já passou — o prazo de 25 dias
 *    começa quando a equipe marca o envio como cadastrado (artes.ts). Envio
 *    não cadastrado (em análise, rejeitado) não tem prazo e nunca é apagado.
 *    Trava extra: nada sai antes de 15 dias do cadastro, mesmo que a data
 *    tenha sido gravada errada. Os registros (envio e lista de arquivos)
 *    ficam, para o histórico do cliente; só os arquivos saem.
 * 2. Notas de despesa (bucket `despesas`): apaga fotos/PDFs com mais de 15
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
/** Envios vencidos há mais que isso já foram limpos em execuções anteriores. */
const JANELA_ARTES_DIAS = 60
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
  const resumo = { simulacao: simular, artes: { envios: 0, arquivos: 0 }, despesas: { verificados: 0, orfaos: 0 }, erros: [] as string[] }

  // 1 ---------------------------------------------------------------- artes
  const desde = new Date(agora.getTime() - JANELA_ARTES_DIAS * 24 * 60 * 60 * 1000).toISOString()
  const { data: envios, error: erroEnvios } = await admin
    .from('envios_arte')
    .select('id, envio_arte_arquivos(caminho)')
    .eq('situacao', 'cadastrado')
    .lt('arquivos_expiram_em', agora.toISOString())
    .gte('arquivos_expiram_em', desde)
    .lt('processado_em', new Date(agora.getTime() - PRAZO_ORFAO_MS).toISOString())
  if (erroEnvios) {
    resumo.erros.push(`artes: ${erroEnvios.message}`)
  } else {
    type Envio = { id: string; envio_arte_arquivos: { caminho: string }[] | null }
    const caminhos = ((envios ?? []) as Envio[]).flatMap((e) => (e.envio_arte_arquivos ?? []).map((a) => a.caminho))
    resumo.artes.envios = (envios ?? []).length
    resumo.artes.arquivos = caminhos.length
    if (!simular) {
      for (let i = 0; i < caminhos.length; i += LOTE) {
        const { error } = await admin.storage.from('envios-arte').remove(caminhos.slice(i, i + LOTE))
        if (error) resumo.erros.push(`artes: ${error.message}`)
      }
    }
  }

  // 2 ------------------------------------------------------------- despesas
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
