/**
 * Condição de pagamento de uma nota e as parcelas que ela gera em contas a
 * pagar. Puro: roda na tela de conferência e no servidor. O banco valida de
 * novo (`contas_pagar_validar_parcelas`), com a mesma regra.
 */

export const CONDICOES = ['pago', 'pix', 'debito', 'credito', 'boleto', 'a_pagar'] as const
export type Condicao = (typeof CONDICOES)[number]

export const ROTULO_CONDICAO: Record<Condicao, string> = {
  pago: 'Já pago (dinheiro, transferência)',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  a_pagar: 'A pagar (outro combinado)',
}

export const ROTULO_CURTO: Record<Condicao, string> = {
  pago: 'Pago',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  boleto: 'Boleto',
  a_pagar: 'A pagar',
}

/** Já sai paga na emissão: não tem parcela nem vencimento a escolher. */
export const quitadaNaCompra = (c: Condicao) => c === 'pago' || c === 'pix' || c === 'debito'

export const MAX_PARCELAS_CONTA = 36

/**
 * Nota lançada sem foto/PDF: depois deste prazo (desde o lançamento) o
 * dashboard avisa em vermelho até alguém anexar o comprovante.
 */
export const PRAZO_COMPROVANTE_DIAS = 2

export type Parcela = { vencimento: string; valor: number }

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** Soma meses a uma data AAAA-MM-DD, segurando no último dia do mês (31/01 + 1 mês = 28/02). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  return `${alvo.getUTCFullYear()}-${doisDigitos(alvo.getUTCMonth() + 1)}-${doisDigitos(Math.min(d, ultimo))}`
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const r = new Date(Date.UTC(a, m - 1, d + dias))
  return `${r.getUTCFullYear()}-${doisDigitos(r.getUTCMonth() + 1)}-${doisDigitos(r.getUTCDate())}`
}

/**
 * Divide o total em `n` parcelas mensais a partir do primeiro vencimento.
 * Os centavos que sobram da divisão vão na primeira.
 */
export function gerarParcelas(total: number, n: number, primeiroVencimento: string): Parcela[] {
  const qtd = Math.max(1, Math.min(MAX_PARCELAS_CONTA, Math.floor(n) || 1))
  const centavos = Math.round(total * 100)
  const base = Math.floor(centavos / qtd)
  const resto = centavos - base * qtd
  return Array.from({ length: qtd }, (_, i) => ({
    vencimento: somarMeses(primeiroVencimento, i),
    valor: (base + (i === 0 ? resto : 0)) / 100,
  }))
}

/** Mesma regra da função do banco. Devolve a mensagem de erro, ou null. */
export function validarParcelas(parcelas: Parcela[], total: number | null): string | null {
  if (!parcelas.length || parcelas.length > MAX_PARCELAS_CONTA) return `Informe de 1 a ${MAX_PARCELAS_CONTA} parcelas.`
  if (parcelas.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento) || !(p.valor > 0)))
    return 'Cada parcela precisa de vencimento e valor maior que zero.'
  if (total != null) {
    const soma = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100
    if (Math.abs(soma - Math.round(total * 100) / 100) > 0.01) {
      const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      return `A soma das parcelas (R$ ${brl(soma)}) não confere com o total da nota (R$ ${brl(total)}).`
    }
  }
  return null
}

/** Prazo padrão do primeiro vencimento, quando a nota não traz duplicatas. */
export function primeiroVencimentoPadrao(condicao: Condicao, emissao: string): string {
  return condicao === 'credito' ? somarMeses(emissao, 1) : somarDias(emissao, 30)
}
