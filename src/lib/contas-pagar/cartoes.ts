/**
 * Fatura do cartão de crédito: em que fatura uma compra cai e quando ela
 * vence. Puro — roda na conferência da nota (sugere os vencimentos) e pode
 * rodar no servidor.
 *
 * Regra (decisão do dono, 12/10/2026): a compra feita até o dia de
 * fechamento entra na fatura daquele mês; depois do fechamento, na do mês
 * seguinte. A fatura vence no dia de vencimento do cartão — no mesmo mês do
 * fechamento quando o vencimento vem depois dele, senão no mês seguinte.
 * Parcelas seguintes caem uma fatura por mês. Dia maior que o mês tem
 * (31 em fevereiro) segura no último dia.
 */
import { somarMeses } from './condicoes'

export type CartaoCredito = {
  id: string
  nome: string
  final: string | null
  diaFechamento: number
  diaVencimento: number
  ativo: boolean
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

function diaNoMes(ano: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(Math.min(dia, ultimo))}`
}

/** Vencimento da fatura em que cai uma compra feita em `compra` (AAAA-MM-DD). */
export function vencimentoDaFatura(compra: string, cartao: Pick<CartaoCredito, 'diaFechamento' | 'diaVencimento'>): string {
  const [ano, mes, dia] = compra.split('-').map(Number)
  // Mês da fatura (o do fechamento em que a compra entra)
  let fAno = ano
  let fMes = mes
  if (dia > cartao.diaFechamento) {
    fMes += 1
    if (fMes > 12) {
      fMes = 1
      fAno += 1
    }
  }
  // Vencimento depois do fechamento: mesmo mês; senão, mês seguinte
  let vAno = fAno
  let vMes = fMes
  if (cartao.diaVencimento <= cartao.diaFechamento) {
    vMes += 1
    if (vMes > 12) {
      vMes = 1
      vAno += 1
    }
  }
  return diaNoMes(vAno, vMes, cartao.diaVencimento)
}

/** Vencimentos das `n` parcelas de uma compra no cartão: uma fatura por mês a partir da primeira. */
export function vencimentosNoCartao(compra: string, cartao: Pick<CartaoCredito, 'diaFechamento' | 'diaVencimento'>, n: number): string[] {
  const primeiro = vencimentoDaFatura(compra, cartao)
  return Array.from({ length: Math.max(1, n) }, (_, i) => somarMeses(primeiro, i))
}

export const rotuloCartao = (c: Pick<CartaoCredito, 'nome' | 'final'>) => (c.final ? `${c.nome} · final ${c.final}` : c.nome)
