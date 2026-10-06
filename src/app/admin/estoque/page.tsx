import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import BuscaPagina from '@/components/busca-pagina'
import Tecidos from './tecidos'
import NovoMovimento from './novo-movimento'
import Saldos, { type SaldoLinha, type MovimentoLinha } from './saldos'
import FormEnvioTecido from '@/components/form-envio-tecido'
import EnviosTecido from '@/components/envios-tecido'
import { listarEnvios } from '@/lib/estoque/envios'

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const perfil = await lerPerfil()
  if (!perfil || perfil.papel === 'cliente') redirect('/')

  const dono = perfil.papel === 'admin' || perfil.papel === 'financeiro'
  const { cliente: clienteFiltro } = await searchParams
  const supabase = await createClient()

  // As políticas do banco deixam a equipe inteira ler tudo isto
  const [{ data: tecidos }, { data: clientes }, { data: saldos }, envios] = await Promise.all([
    supabase.from('tecidos').select('id, nome, ativo').order('nome'),
    supabase
      .from('clientes')
      .select('id, razao_social')
      .eq('ativo', true)
      .is('arquivado', false)
      .order('razao_social'),
    supabase.from('tecido_saldos').select('cliente_id, tecido_id, saldo_metros, ultimo_movimento'),
    listarEnvios({ clienteId: clienteFiltro || undefined }),
  ])

  let movimentos: MovimentoLinha[] = []
  if (clienteFiltro) {
    const { data } = await supabase
      .from('tecido_movimentos')
      .select('id, tecido_id, pedido_id, tipo, metros, observacao, autor_id, criado_em, pedidos(numero)')
      .eq('cliente_id', clienteFiltro)
      .order('criado_em', { ascending: false })
      .limit(200)

    const autores = [...new Set((data ?? []).map((m: any) => m.autor_id).filter(Boolean))] as string[]
    const nomes = new Map<string, string>()
    if (autores.length) {
      const { data: perfis } = await supabase.from('profiles').select('id, nome').in('id', autores)
      perfis?.forEach((p) => p.nome && nomes.set(p.id as string, p.nome as string))
    }

    movimentos = ((data ?? []) as any[]).map((m) => ({
      id: m.id,
      tecidoId: m.tecido_id,
      tipo: m.tipo,
      metros: Number(m.metros),
      observacao: m.observacao ?? null,
      autor: m.autor_id ? nomes.get(m.autor_id) ?? null : null,
      pedidoId: m.pedido_id ?? null,
      pedidoNumero: m.pedidos?.numero != null ? Number(m.pedidos.numero) : null,
      data: m.criado_em,
    }))
  }

  const nomeTecido = new Map((tecidos ?? []).map((t) => [t.id as string, t.nome as string]))
  const nomeCliente = new Map((clientes ?? []).map((c) => [c.id as string, c.razao_social as string]))

  const linhas: SaldoLinha[] = ((saldos ?? []) as any[])
    .filter((s) => !clienteFiltro || s.cliente_id === clienteFiltro)
    .map((s) => ({
      clienteId: s.cliente_id,
      cliente: nomeCliente.get(s.cliente_id) ?? '—',
      tecidoId: s.tecido_id,
      tecido: nomeTecido.get(s.tecido_id) ?? '—',
      saldo: Number(s.saldo_metros),
      ultimo: s.ultimo_movimento,
    }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente) || a.tecido.localeCompare(b.tecido))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] shrink-0">
          Estoque de tecido
        </h1>
        <BuscaPagina placeholder="Filtrar por cliente ou tecido..." rotulo="Filtrar esta página" />
      </div>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        Quanto de cada tecido cada cliente tem na estamparia. O saldo é a soma
        das movimentações — vale a metragem conferida pela equipe.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <NovoMovimento
          clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
          tecidos={(tecidos ?? []).filter((t) => t.ativo).map((t) => ({ id: t.id as string, nome: t.nome as string }))}
          clienteInicial={clienteFiltro ?? ''}
        />
        <FormEnvioTecido
          clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
          tecidos={(tecidos ?? []).filter((t) => t.ativo).map((t) => ({ id: t.id as string, nome: t.nome as string }))}
          clienteInicial={clienteFiltro ?? ''}
        />
      </div>

      <EnviosTecido envios={envios} modo="equipe" titulo="ENVIOS DE TECIDO — CONFERÊNCIA" />

      <Saldos
        linhas={linhas}
        clientes={(clientes ?? []).map((c) => ({ id: c.id as string, nome: c.razao_social as string }))}
        clienteFiltro={clienteFiltro ?? ''}
        movimentos={movimentos}
        nomeTecido={Object.fromEntries(nomeTecido)}
      />

      {dono && (
        <Tecidos
          tecidos={(tecidos ?? []).map((t) => ({ id: t.id as string, nome: t.nome as string, ativo: !!t.ativo }))}
        />
      )}
    </div>
  )
}
