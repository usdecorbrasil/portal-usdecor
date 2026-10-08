/** CSV para o Excel em pt-BR: ponto e vírgula, aspas escapadas, BOM. Só no navegador. */
export function paraCsv(linhas: (string | number | null | undefined)[][]): string {
  return linhas
    .map((linha) =>
      linha.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')
    )
    .join('\r\n')
}

export function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const numCsv = (v: number) => v.toFixed(2).replace('.', ',')
