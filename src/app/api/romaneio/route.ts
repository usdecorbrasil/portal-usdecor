import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { buscarDadosRomaneio } from '@/app/actions/romaneio'
import { RomaneioDocumento, type DadosRomaneio } from '@/lib/pdf/romaneio'
import { lerPerfil } from '@/lib/auth/perfil'

const MAX_PEDIDOS = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  // Romaneio é documento interno da produção: cliente não acessa
  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') {
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 })
  }
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length > MAX_PEDIDOS) {
    return NextResponse.json({ erro: `Selecione no máximo ${MAX_PEDIDOS} pedidos por vez.` }, { status: 400 })
  }
  if (ids.some((id) => !UUID.test(id))) {
    return NextResponse.json({ erro: 'Pedido inválido.' }, { status: 400 })
  }

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
      notas: d.notas,
      tecido: d.tecido,
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
