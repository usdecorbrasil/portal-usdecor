/**
 * Sugere a qual suprimento cadastrado um item de nota corresponde.
 *
 * Puro (roda no navegador, na conferência da nota). Duas fontes, nesta ordem:
 *  1. Histórico: o mesmo item já foi vinculado numa nota anterior — mesmo
 *     código do mesmo fornecedor, ou a mesma descrição. É o sinal mais forte,
 *     e cresce sozinho a cada nota salva.
 *  2. Nome: as palavras do nome do suprimento aparecem na descrição do item
 *     ("Tinta Sublimática Ciano 1L" × "TINTA SUBLIM CIANO 1 LT").
 */

export type SuprimentoRef = { id: string; nome: string; unidade: string }

/** Item de nota anterior que foi vinculado a um suprimento. */
export type VinculoAnterior = {
  descricao: string
  codigo: string | null
  fornecedorDoc: string | null
  suprimentoId: string
  /** AAAA-MM-DD da nota. */
  data: string | null
}

export type Sugestao = {
  suprimentoId: string
  /** alta: vincula sozinho (com aviso para conferir); media: só sugere. */
  certeza: 'alta' | 'media'
  motivo: string
}

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'p', 'c', 'em', 'a', 'o', 'un', 'und', 'unid', 'pc', 'pct', 'cx'])

/** Abreviações comuns em nota fiscal → palavra cheia. */
const SINONIMOS: Record<string, string> = {
  sublim: 'sublimatica',
  sublimat: 'sublimatica',
  sublimatico: 'sublimatica',
  sub: 'sublimatica',
  pap: 'papel',
  tnt: 'tinta',
  tin: 'tinta',
  lt: 'l',
  lts: 'l',
  litro: 'l',
  litros: 'l',
  mts: 'm',
  mt: 'm',
  metro: 'm',
  metros: 'm',
  gr: 'g',
  grs: 'g',
  amar: 'amarelo',
  amarela: 'amarelo',
  mag: 'magenta',
  cian: 'ciano',
  cyan: 'ciano',
  pret: 'preto',
  preta: 'preto',
  black: 'preto',
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)[,.](\d)/g, '$1_$2') // 1,5 continua um número só
    .replace(/(\d)([a-z])/g, '$1 $2') // 1L → 1 l, 90G → 90 g
    .replace(/[^a-z0-9_]+/g, ' ')
    .trim()
}

function palavras(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(' ')
      .map((p) => SINONIMOS[p] ?? p)
      .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
  )
}

const dataBr = (d: string | null) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : null)

/**
 * Quanto do nome do suprimento está na descrição (0 a 1). Números contam
 * em dobro: "1 l" × "5 l" é outro produto, mesmo com o resto igual.
 */
export function semelhanca(descricao: string, nomeSuprimento: string): number {
  const d = palavras(descricao)
  const s = palavras(nomeSuprimento)
  if (!s.size || !d.size) return 0
  let total = 0
  let achou = 0
  for (const p of s) {
    const peso = /\d/.test(p) ? 2 : 1
    total += peso
    if (d.has(p)) achou += peso
    else if (p.length >= 5 && [...d].some((x) => x.length >= 4 && (x.startsWith(p.slice(0, 4)) || p.startsWith(x)))) achou += peso * 0.7
  }
  return achou / total
}

export function sugerirVinculo(
  item: { descricao: string; codigo: string },
  fornecedorDoc: string,
  suprimentos: SuprimentoRef[],
  historico: VinculoAnterior[]
): Sugestao | null {
  const ativos = new Map(suprimentos.map((s) => [s.id, s]))
  const doc = fornecedorDoc.replace(/\D/g, '')
  const codigo = item.codigo.trim().toLowerCase()
  const desc = normalizar(item.descricao)
  if (!desc && !codigo) return null

  // 1. Histórico — o mais recente primeiro
  const ordenado = [...historico].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
  if (codigo && doc) {
    const h = ordenado.find(
      (v) => ativos.has(v.suprimentoId) && v.codigo?.trim().toLowerCase() === codigo && v.fornecedorDoc?.replace(/\D/g, '') === doc
    )
    if (h) return { suprimentoId: h.suprimentoId, certeza: 'alta', motivo: `mesmo código deste fornecedor na nota de ${dataBr(h.data) ?? 'antes'}` }
  }
  if (desc) {
    const h = ordenado.find((v) => ativos.has(v.suprimentoId) && normalizar(v.descricao) === desc)
    if (h) return { suprimentoId: h.suprimentoId, certeza: 'alta', motivo: `mesma descrição da nota de ${dataBr(h.data) ?? 'antes'}` }
  }

  // 2. Nome do suprimento dentro da descrição
  const notas = suprimentos
    .map((s) => ({ s, nota: semelhanca(item.descricao, s.nome) }))
    .filter((x) => x.nota >= 0.5)
    .sort((a, b) => b.nota - a.nota)
  if (!notas.length) return null
  const [melhor, segundo] = notas
  // Empate entre dois candidatos (ex.: duas cores e a descrição sem cor) → não sugere
  if (segundo && segundo.nota >= melhor.nota - 0.05) return null
  return {
    suprimentoId: melhor.s.id,
    certeza: melhor.nota >= 0.99 ? 'alta' : 'media',
    motivo: melhor.nota >= 0.99 ? 'o nome do suprimento aparece na descrição' : 'nome parecido',
  }
}

/** Suprimentos com nome parecido com o que se vai cadastrar — para evitar duplicata. */
export function parecidos(nome: string, suprimentos: SuprimentoRef[]): SuprimentoRef[] {
  return suprimentos
    .map((s) => ({ s, nota: Math.min(semelhanca(nome, s.nome), semelhanca(s.nome, nome)) }))
    .filter((x) => x.nota >= 0.75)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 3)
    .map((x) => x.s)
}
