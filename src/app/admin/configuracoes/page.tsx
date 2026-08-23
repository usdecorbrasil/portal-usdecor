import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import Equipe from './equipe'
import ConfigValorMinimoBoleto from './config-valor-minimo'
import ConfigMaxParcelas from './config-max-parcelas'
import { buscarValorMinimoBoleto, buscarMaxParcelas } from '@/app/actions/configuracoes'

export default async function ConfiguracoesPage() {
  const perfil = await lerPerfil()

  if (!perfil || (perfil.papel !== 'admin' && perfil.papel !== 'financeiro')) {
    redirect('/admin/pedidos')
  }

  const supabase = await createClient()

  const { data: membros } = await supabase
    .from('profiles')
    .select('id, nome, role, ativo')
    .in('role', ['admin', 'funcionario', 'financeiro'])
    .eq('arquivado', false)
    .order('role')
    .order('nome')

  const { data: arquivados } = await supabase
    .from('profiles')
    .select('id, nome, role, ativo')
    .in('role', ['admin', 'funcionario', 'financeiro'])
    .eq('arquivado', true)
    .order('nome')

  const admin = createAdminClient()
  const { data: usuarios } = await admin.auth.admin.listUsers()

  const emailPorId = new Map(
    (usuarios?.users ?? []).map((u) => [u.id, u.email ?? ''])
  )

  const [valorMinimoBoleto, maxParcelas] = await Promise.all([
    buscarValorMinimoBoleto(),
    buscarMaxParcelas(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Configurações
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        Equipe e ajustes do portal
      </p>

      <Equipe
        membros={(membros ?? []).map((m) => ({
          id: m.id,
          nome: m.nome,
          email: emailPorId.get(m.id) ?? '—',
          papel: m.role as 'admin' | 'funcionario' | 'financeiro',
          ativo: m.ativo,
          souEu: m.id === perfil.id,
        }))}
        arquivados={(arquivados ?? []).map((m) => ({
          id: m.id,
          nome: m.nome,
          email: emailPorId.get(m.id) ?? '—',
          papel: m.role as 'admin' | 'funcionario' | 'financeiro',
          ativo: m.ativo,
          souEu: m.id === perfil.id,
        }))}
      />

      <div className="mt-8">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          AUTOMAÇÕES E REGRAS
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <ConfigValorMinimoBoleto valorAtual={valorMinimoBoleto} />
        <ConfigMaxParcelas valorAtual={maxParcelas} />
      </div>

      <div className="mt-8">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          INTEGRAÇÕES
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold tracking-tight text-sm">Bling</h3>
              <p className="text-xs text-[#6E6E68] mt-1">
                Conecte para sincronizar pedidos, boletos e notas fiscais.
              </p>
            </div>
            <a href="/api/bling/conectar" className="bg-[#131A2E] text-white rounded-sm px-4 py-2 text-xs font-semibold tracking-wide whitespace-nowrap">
              CONECTAR
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}