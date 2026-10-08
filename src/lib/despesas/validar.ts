/**
 * Dígitos verificadores de CNPJ, CPF e chave de acesso de NF-e/NFC-e.
 * Puro: serve para o servidor recusar leitura errada e para a tela avisar.
 */

function todosIguais(d: string) {
  return /^(\d)\1+$/.test(d)
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || todosIguais(d)) return false
  const dv = (fatias: number) => {
    let soma = 0
    for (let i = 0; i < fatias; i++) soma += Number(d[i]) * (fatias + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || todosIguais(d)) return false
  const dv = (tamanho: number) => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * pesos[i]
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

export function cnpjCpfValido(doc: string): boolean {
  const d = doc.replace(/\D/g, '')
  return d.length === 14 ? cnpjValido(d) : d.length === 11 ? cpfValido(d) : false
}

/** Chave de acesso: 44 dígitos, último é DV módulo 11 dos 43 anteriores. */
export function chaveAcessoValida(chave: string): boolean {
  const d = chave.replace(/\D/g, '')
  if (d.length !== 44) return false
  let soma = 0
  let peso = 2
  for (let i = 42; i >= 0; i--) {
    soma += Number(d[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const r = soma % 11
  const dv = r < 2 ? 0 : 11 - r
  return dv === Number(d[43])
}
