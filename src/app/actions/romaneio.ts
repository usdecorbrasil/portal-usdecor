'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Resultado = { ok: true } | { ok: false; erro: string }

export async function confirmarRomaneio(
  pedidoId: string,
  metragem: number
): Promise<Resultado> {
  const parsed = z.object({
    pedidoId: z.string().uuid(),
    metragem: z.number().positive('Informe a metragem total impressa'),
  }).safeParse({ pedidoId, metragem })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('confirmar_romaneio', {
    p_pedido_id: parsed.data.pedidoId,
    p_metragem: parsed.data.metragem,
    p_rolos: null,
    p_saldo: null,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/admin/pedidos')
  revalidatePath('/admin/fila')
  revalidatePath(`/admin/pedidos/${pedidoId}`)

  return { ok: true }
}

export async function buscarDadosRomaneio(pedidoId: string) {
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select(`
      id, numero, total, romaneio_rolos, romaneio_saldo, metragem_impressa, notas,
      clientes(razao_social),
      pedido_itens(id, sku, nome, produto_id, quantidade_faturada)
    `)
    .eq('id', pedidoId)
    .single()

  if (!pedido) return null

  const p = pedido as any
  const itens = (p.pedido_itens ?? []) as any[]

  const urls = new Map<string, string>()
  if (itens.length) {
    const { data: produtos } = await supabase
      .from('produtos')
      .select('id, imagem_path')
      .in('id', itens.map((i) => i.produto_id))

    const caminhos = (produtos ?? []).map((x) => x.imagem_path).filter(Boolean) as string[]

    if (caminhos.length) {
      // O PDF (@react-pdf/renderer) não suporta imagens .webp, então baixamos
      // e convertemos para PNG embutido como data URI em vez de usar URL assinada.
      const porCaminho = new Map<string, string>()

      // Carregado só aqui: este módulo também é importado pela listagem de
      // pedidos (via confirmarRomaneio), e o sharp no topo fazia essa rota
      // pagar o binário nativo a cada início frio da função
      const sharp = (await import('sharp')).default

      await Promise.all(
        caminhos.map(async (caminho) => {
          const { data } = await supabase.storage.from('artes').download(caminho)
          if (!data) return

          try {
            const bytes = Buffer.from(await data.arrayBuffer())
            const png = await sharp(bytes).png().toBuffer()
            porCaminho.set(caminho, `data:image/png;base64,${png.toString('base64')}`)
          } catch {
            // imagem corrompida/formato não suportado — segue sem ela
          }
        })
      )

      produtos?.forEach((x) => {
        if (x.imagem_path) {
          const u = porCaminho.get(x.imagem_path)
          if (u) urls.set(x.id, u)
        }
      })
    }
  }

  return {
    numero: Number(p.numero),
    cliente: p.clientes?.razao_social ?? '—',
    rolos: p.romaneio_rolos as number | null,
    saldo: p.romaneio_saldo as string | null,
    metragemImpressa: p.metragem_impressa ? Number(p.metragem_impressa) : null,
    notas: ((p.notas as string | null) ?? '').trim() || null,
    itens: itens.map((i) => ({
      sku: i.sku,
      nome: i.nome,
      quantidade: i.quantidade_faturada,
      imagemUrl: i.produto_id ? urls.get(i.produto_id) ?? null : null,
    })),
  }
}