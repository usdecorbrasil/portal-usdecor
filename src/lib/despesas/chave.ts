/**
 * O que a chave de acesso de 44 dígitos já diz sobre a nota. Puro: roda na
 * tela de conferência e no servidor (e o banco confere o mesmo no gatilho
 * `despesas_validar`).
 *
 * Layout (NF-e e NFC-e): cUF(2) AAMM(4) CNPJ/CPF do emitente(14) modelo(2)
 * série(3) número(9) tpEmis(1) código(8) DV(1). Emitente pessoa física vem
 * como "000" + CPF.
 */
import { chaveAcessoValida, cnpjValido, cpfValido } from './validar'

export type DadosChave = {
  ano: number
  mes: number
  /** CNPJ (14) ou CPF (11), só dígitos. */
  emitenteDoc: string
  modelo: string
  serie: string
  numero: string
}

const semZeros = (s: string) => s.replace(/^0+(?=\d)/, '')
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Decodifica uma chave válida (dígito verificador conferido); null se não for. */
export function lerChave(chave: string | null | undefined): DadosChave | null {
  const d = digitos(chave)
  if (!chaveAcessoValida(d)) return null
  const doc14 = d.slice(6, 20)
  const emitenteDoc = doc14.startsWith('000') && !cnpjValido(doc14) && cpfValido(doc14.slice(3)) ? doc14.slice(3) : doc14
  return {
    ano: 2000 + Number(d.slice(2, 4)),
    mes: Number(d.slice(4, 6)),
    emitenteDoc,
    modelo: d.slice(20, 22),
    serie: semZeros(d.slice(22, 25)),
    numero: semZeros(d.slice(25, 34)),
  }
}

export type CamposChave = {
  tipo: string
  fornecedorDoc: string
  numero: string
  serie: string
  emissao: string
}

const TIPO_DO_MODELO: Record<string, string> = { '55': 'nfe', '65': 'nfce' }

/** O que difere entre os campos e a chave, em texto para a tela. Vazio quando bate ou não há chave válida. */
export function divergenciasDaChave(c: CamposChave, chave: string | null | undefined): string[] {
  const k = lerChave(chave)
  if (!k) return []
  const out: string[] = []
  if (digitos(c.fornecedorDoc) && digitos(c.fornecedorDoc) !== k.emitenteDoc) out.push(`CNPJ/CPF do fornecedor (a chave diz ${k.emitenteDoc})`)
  if (digitos(c.numero) && semZeros(digitos(c.numero)) !== k.numero) out.push(`número (a chave diz ${k.numero})`)
  if (digitos(c.serie) && semZeros(digitos(c.serie)) !== k.serie) out.push(`série (a chave diz ${k.serie})`)
  if (/^\d{4}-\d{2}/.test(c.emissao)) {
    const [a, m] = c.emissao.split('-').map(Number)
    if (a !== k.ano || m !== k.mes) out.push(`mês da emissão (a chave diz ${String(k.mes).padStart(2, '0')}/${k.ano})`)
  }
  return out
}

/**
 * Corrige pela chave o que ela diz com certeza (emitente, número, série,
 * tipo). A data não é corrigida — a chave só tem mês e ano — e fica como aviso.
 * Devolve os campos novos e a lista do que mudou.
 */
export function corrigirPelaChave<T extends CamposChave>(c: T, chave: string | null | undefined): { campos: T; ajustes: string[] } {
  const k = lerChave(chave)
  if (!k) return { campos: c, ajustes: [] }
  const campos = { ...c }
  const ajustes: string[] = []
  if (digitos(c.fornecedorDoc) !== k.emitenteDoc) {
    campos.fornecedorDoc = k.emitenteDoc
    ajustes.push(c.fornecedorDoc ? 'CNPJ/CPF do fornecedor' : 'CNPJ/CPF do fornecedor (estava em branco)')
  }
  if (semZeros(digitos(c.numero)) !== k.numero) {
    campos.numero = k.numero
    if (digitos(c.numero)) ajustes.push('número')
  }
  if (semZeros(digitos(c.serie)) !== k.serie) {
    campos.serie = k.serie
    if (digitos(c.serie)) ajustes.push('série')
  }
  const tipo = TIPO_DO_MODELO[k.modelo]
  if (tipo && c.tipo !== tipo) {
    campos.tipo = tipo
    ajustes.push('tipo do documento')
  }
  return { campos, ajustes }
}
