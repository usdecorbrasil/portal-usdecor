import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { buscarDadosRomaneio } from '@/app/actions/romaneio'
import { RomaneioDocumento, type DadosRomaneio } from '@/lib/pdf/romaneio'

export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    return NextResponse.json({ erro: 'Nenhum pedido selecionado.' }, { status: 400 })
  }

  const resultados = await Promise.all(ids.map((id) => buscarDadosRomaneio(id)))

  const documentos: DadosRomaneio[] = resultados
    .filter(
      (d): d is NonNullable<typeof d> & { metragemImpressa: number } =>
        !!d && d.metragemImpressa !== null
    )
    .map((d) => ({
      numero: d.numero,
      cliente: d.cliente,
      rolos: d.rolos,
      saldo: d.saldo,
      metragemImpressa: d.metragemImpressa,
      itens: d.itens,
    }))

  if (documentos.length === 0) {
    return NextResponse.json(
      { erro: 'Nenhum romaneio disponível para os pedidos selecionados.' },
      { status: 404 }
    )
  }

  const buffer = await renderToBuffer(
    RomaneioDocumento({ pedidos: documentos })
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="romaneio-calandra.pdf"',
    },
  })
}
