import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { buscarDadosRomaneio } from '@/app/actions/romaneio'
import { RomaneioDocumento, type DadosRomaneio } from '@/lib/pdf/romaneio'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const dados = await buscarDadosRomaneio(id)

  if (!dados || dados.metragemImpressa === null) {
    return NextResponse.json(
      { erro: 'Romaneio ainda não foi confirmado para este pedido.' },
      { status: 404 }
    )
  }

  const documento: DadosRomaneio = {
    numero: dados.numero,
    cliente: dados.cliente,
    rolos: dados.rolos,
    saldo: dados.saldo,
    metragemImpressa: dados.metragemImpressa,
    notas: dados.notas,
    tecido: dados.tecido,
    itens: dados.itens,
  }

  const buffer = await renderToBuffer(
    RomaneioDocumento({ pedidos: [documento] })
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="romaneio-pedido-${dados.numero}.pdf"`,
    },
  })
}