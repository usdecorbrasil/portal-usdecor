import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import BuscaPagina from '@/components/busca-pagina'
import ListaFila from './lista-fila'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function FilaPage() {
  const perfil = await lerPerfil()

  if (!perfil || perfil.papel === 'cliente') redirect('/')

  const nivelAdmin = perfil.papel === 'admin' || perfil.papel === 'financeiro'
  const supabase = await createClient()

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, numero, ordem_fila, fila_reimpressao,
      clientes(razao_social),
      pedido_itens(quantidade_faturada),
      pedido_status_historico(status, created_at)
    `)
    .not('ordem_fila', 'is', null)
    .is('cancelado_em', null)
    .order('ordem_fila')

  const itens = ((pedidos ?? []) as any[]).map((p) => {
    // Quando o pedido entrou em impressão
    const impressao = (p.pedido_status_historico ?? [])
      .filter((h: any) => h.status === 'impressao')
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]

    return {
      id: p.id,
      numero: p.numero,
      cliente: p.clientes?.razao_social ?? '—',
      unidades: (p.pedido_itens ?? []).reduce(
        (a: number, i: any) => a + Number(i.quantidade_faturada),
        0
      ),
      artes: (p.pedido_itens ?? []).length,
      reimpressao: !!p.fila_reimpressao,
      desde: impressao?.created_at ?? new Date().toISOString(),
    }
  })

  const unidadesTotal = itens.reduce((a, i) => a + i.unidades, 0)
  const reimpressoes = itens.filter((i) => i.reimpressao).length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Fila de impressão
        </h1>
        <BuscaPagina
          placeholder="Filtrar por nº ou cliente..."
          rotulo="Filtrar a fila desta página"
        />
      </div>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        {itens.length} {itens.length === 1 ? 'pedido' : 'pedidos'} ·{' '}
        <span className="font-mono">{unidadesTotal} un</span> a estampar
        {reimpressoes > 0 && (
          <>
            {' · '}
            <span className="text-[#C79600]">
              {reimpressoes} reimpress{reimpressoes === 1 ? 'ão' : 'ões'}
            </span>
          </>
        )}
      </p>

      {!nivelAdmin && itens.length > 0 && (
        <p className="text-xs text-[#6E6E68] bg-white border border-[#DDDCD5] rounded-sm p-3 mb-4 leading-relaxed">
          Produza de cima para baixo. Ao lançar a próxima etapa, o pedido sai da
          fila automaticamente.
        </p>
      )}

      <ListaFila itens={itens} podeReordenar={nivelAdmin} />
    </div>
  )
}