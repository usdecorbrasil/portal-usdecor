import 'server-only'
import { chamarBling } from './cliente'

/**
 * NF-e a partir do pedido de venda que já existe no Bling.
 *
 * Três chamadas: `gerar-nfe` cria a nota no Bling a partir do pedido,
 * `enviar` transmite para a SEFAZ, e `GET /nfe/{id}` diz em que pé ela está.
 * A autorização não é instantânea — por isso a consulta é repetida algumas
 * vezes antes de desistir e devolver "ainda processando".
 */

const PAUSA_MS = 400
const pausa = (ms = PAUSA_MS) => new Promise((r) => setTimeout(r, ms))

/** Situações da NF no Bling. */
export const NF_SITUACAO: Record<number, string> = {
  1: 'Pendente',
  2: 'Cancelada',
  3: 'Aguardando recibo',
  4: 'Rejeitada',
  5: 'Autorizada',
  6: 'Emitida DANFE',
  7: 'Registrada',
  8: 'Aguardando protocolo',
  9: 'Denegada',
  10: 'Consulta situação',
  11: 'Bloqueada',
}

const AUTORIZADA = [5, 6, 7]
const FALHOU = [2, 4, 9, 11]

export type NotaFiscal = {
  id: number
  situacao: number
  numero: string | null
  chaveAcesso: string | null
  linkDanfe: string | null
  linkPDF: string | null
  xml: string | null
}

type Falha = { ok: false; erro: string; nfId?: number }
type Sucesso = { ok: true; nf: NotaFiscal }
type Processando = { ok: false; processando: true; nfId: number; situacao: number }

function lerNota(dados: unknown, id: number): NotaFiscal {
  const d = ((dados as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>
  return {
    id,
    situacao: Number(d.situacao ?? 0),
    numero: d.numero ? String(d.numero) : null,
    chaveAcesso: d.chaveAcesso ? String(d.chaveAcesso) : null,
    linkDanfe: d.linkDanfe ? String(d.linkDanfe) : null,
    linkPDF: d.linkPDF ? String(d.linkPDF) : null,
    xml: d.xml ? String(d.xml) : null,
  }
}

/** Cria a nota no Bling a partir do pedido de venda. Devolve o id da nota. */
export async function gerarNfe(blingPedidoId: number): Promise<{ ok: true; nfId: number } | Falha> {
  const r = await chamarBling(`/pedidos/vendas/${blingPedidoId}/gerar-nfe`, {
    method: 'POST',
  })

  if (!r.ok) return { ok: false, erro: `Falha ao gerar a NF: ${r.erro.slice(0, 300)}` }

  const d = r.dados as { data?: { idNotaFiscal?: number }; idNotaFiscal?: number }
  const nfId = Number(d?.data?.idNotaFiscal ?? d?.idNotaFiscal ?? 0)

  if (!nfId) return { ok: false, erro: 'O Bling gerou a nota mas não devolveu o id.' }

  return { ok: true, nfId }
}

export async function consultarNfe(nfId: number): Promise<{ ok: true; nf: NotaFiscal } | Falha> {
  const r = await chamarBling(`/nfe/${nfId}`)
  if (!r.ok) return { ok: false, erro: `Falha ao consultar a NF: ${r.erro.slice(0, 300)}`, nfId }
  return { ok: true, nf: lerNota(r.dados, nfId) }
}

/**
 * Transmite (se ainda pendente) e espera a SEFAZ responder. Sem e-mail do
 * Bling: quem avisa o cliente é o portal, com o DANFE anexado.
 */
export async function transmitirEEsperar(
  nfId: number
): Promise<Sucesso | Processando | Falha> {
  const antes = await consultarNfe(nfId)
  if (!antes.ok) return antes

  if (FALHOU.includes(antes.nf.situacao)) {
    return { ok: false, erro: `NF ${NF_SITUACAO[antes.nf.situacao] ?? antes.nf.situacao} no Bling.`, nfId }
  }

  if (antes.nf.situacao === 1) {
    await pausa()
    const env = await chamarBling(`/nfe/${nfId}/enviar?enviarEmail=false`, { method: 'POST' })
    if (!env.ok) {
      return { ok: false, erro: `Falha ao transmitir a NF: ${env.erro.slice(0, 300)}`, nfId }
    }
  }

  // A SEFAZ costuma responder em segundos; oito tentativas cobrem o normal
  // sem estourar o tempo da função
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    await pausa(1500)
    const r = await consultarNfe(nfId)
    if (!r.ok) return r

    if (AUTORIZADA.includes(r.nf.situacao)) return { ok: true, nf: r.nf }
    if (FALHOU.includes(r.nf.situacao)) {
      return { ok: false, erro: `NF ${NF_SITUACAO[r.nf.situacao] ?? r.nf.situacao} pela SEFAZ.`, nfId }
    }
  }

  const ultima = await consultarNfe(nfId)
  return {
    ok: false,
    processando: true,
    nfId,
    situacao: ultima.ok ? ultima.nf.situacao : 0,
  }
}
