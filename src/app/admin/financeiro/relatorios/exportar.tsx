'use client'

import type { Relatorio } from '@/app/actions/relatorios'

/** Excel em pt-BR espera ponto e vírgula como separador */
function paraCsv(linhas: (string | number)[][]) {
  return linhas
    .map((linha) =>
      linha
        .map((celula) => {
          const texto = String(celula ?? '')
          // Aspas duplicadas escapam aspas dentro do campo
          return `"${texto.replace(/"/g, '""')}"`
        })
        .join(';')
    )
    .join('\r\n')
}

function baixar(nome: string, conteudo: string) {
  // BOM faz o Excel reconhecer acentuação
  const blob = new Blob(['﻿' + conteudo], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const num = (v: number) => v.toFixed(2).replace('.', ',')

export default function Exportar({
  relatorio,
  periodo,
}: {
  relatorio: Relatorio
  periodo: string
}) {
  function pedidos() {
    baixar(
      `pedidos-${periodo}.csv`,
      paraCsv([
        ['Pedido', 'Cliente', 'Status', 'Data', 'Unidades', 'Metragem', 'Valor'],
        ...relatorio.pedidos.map((p) => [
          p.numero,
          p.cliente,
          p.statusLabel,
          dataBr(p.criadoEm),
          p.unidades,
          num(p.metragem),
          num(p.total),
        ]),
      ])
    )
  }

  function porCliente() {
    baixar(
      `por-cliente-${periodo}.csv`,
      paraCsv([
        ['Cliente', 'Pedidos', 'Metragem', 'Faturamento'],
        ...relatorio.porCliente.map((c) => [
          c.cliente,
          c.pedidos,
          num(c.metragem),
          num(c.total),
        ]),
      ])
    )
  }

  function artes() {
    baixar(
      `artes-${periodo}.csv`,
      paraCsv([
        ['SKU', 'Nome', 'Unidades', 'Pedidos'],
        ...relatorio.artes.map((a) => [a.sku, a.nome, a.unidades, a.pedidos]),
      ])
    )
  }

  function ajustes() {
    baixar(
      `ajustes-${periodo}.csv`,
      paraCsv([
        ['Pedido', 'Cliente', 'SKU', 'De', 'Para', 'Motivo', 'Data'],
        ...relatorio.ajustes.map((a) => [
          a.numero,
          a.cliente,
          a.sku,
          a.de,
          a.para,
          a.motivo,
          dataBr(a.data),
        ]),
      ])
    )
  }

  const botao =
    'border border-[#DDDCD5] rounded-sm px-3 py-2 text-xs font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]'

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={pedidos} className={botao}>
        CSV · PEDIDOS
      </button>
      <button onClick={porCliente} className={botao}>
        CSV · POR CLIENTE
      </button>
      <button onClick={artes} className={botao}>
        CSV · ARTES
      </button>
      {relatorio.ajustes.length > 0 && (
        <button onClick={ajustes} className={botao}>
          CSV · AJUSTES
        </button>
      )}
    </div>
  )
}
