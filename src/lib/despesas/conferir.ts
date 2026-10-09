/**
 * Regras que dizem se uma leitura da IA saiu boa, para decidir a releitura
 * automática com o modelo preciso. Puro — e só aponta erro que dá para provar
 * (dígito verificador, conta que não fecha), não "desconfiança".
 */
import { cnpjCpfValido, chaveAcessoValida } from './validar'
import { divergenciasDaChave } from './chave'

/** Diferença tolerada entre os itens (− desconto + frete + impostos) e o total impresso. */
export const TOLERANCIA_TOTAL = 0.05

/** O mínimo da leitura que estas regras olham (o resto do documento não importa aqui). */
export type LeituraConferivel = {
  tipo: string
  fornecedor_doc: string | null
  numero: string | null
  serie: string | null
  chave_acesso: string | null
  emissao: string | null
  desconto: number | null
  frete: number | null
  impostos: number | null
  total: number | null
  itens: { valor_total: number }[]
}

export function problemasDaLeitura(d: LeituraConferivel): string[] {
  const out: string[] = []
  const doc = (d.fornecedor_doc ?? '').replace(/\D/g, '')
  if (doc && !cnpjCpfValido(doc)) out.push('CNPJ/CPF do fornecedor com dígito errado')
  const chave = (d.chave_acesso ?? '').replace(/\D/g, '')
  if (chave && !chaveAcessoValida(chave)) out.push('chave de acesso com dígito errado')
  if (chave && chaveAcessoValida(chave)) {
    const div = divergenciasDaChave(
      { tipo: d.tipo, fornecedorDoc: '', numero: '', serie: '', emissao: d.emissao ?? '' },
      chave
    )
    if (div.length) out.push(`${div.join(', ')} não bate com a chave`)
  }
  if (d.total == null || d.total <= 0) {
    out.push('total não encontrado')
  } else if (d.itens.length) {
    const calculado = d.itens.reduce((s, i) => s + i.valor_total, 0) - (d.desconto ?? 0) + (d.frete ?? 0) + (d.impostos ?? 0)
    if (Math.abs(calculado - d.total) > TOLERANCIA_TOTAL) out.push('soma dos itens não fecha com o total')
  }
  if (!d.itens.length) out.push('nenhum item lido')
  return out
}

/** Data de emissão: futura bloqueia; muito antiga só avisa. */
export const DIAS_EMISSAO_ANTIGA = 90

export function avisoDaEmissao(emissao: string, hoje: string): { bloqueia: boolean; texto: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emissao)) return null
  if (emissao > hoje) return { bloqueia: true, texto: 'A data de emissão está no futuro. Confira com o documento.' }
  const [a, m, d] = hoje.split('-').map(Number)
  const limite = new Date(Date.UTC(a, m - 1, d - DIAS_EMISSAO_ANTIGA)).toISOString().slice(0, 10)
  if (emissao < limite) return { bloqueia: false, texto: `Nota emitida há mais de ${DIAS_EMISSAO_ANTIGA} dias. Confira a data — dia e mês trocados é o erro mais comum.` }
  return null
}
