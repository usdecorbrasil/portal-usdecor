import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import Equipe from './equipe'
import ConfigPagamento from './config-pagamento'
import IntegracaoBling from './integracao-bling'
import { buscarConfigPagamento } from '@/app/actions/configuracoes'
import { lerEstadoBling } from '@/lib/bling/cliente'

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

  const [configPagamento, estadoBling] = await Promise.all([
    buscarConfigPagamento(),
    lerEstadoBling(),
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
          PAGAMENTO
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <ConfigPagamento configAtual={configPagamento} />
      </div>

      <div className="mt-8">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          INTEGRAÇÕES
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <IntegracaoBling estado={estadoBling} />
      </div>
    </div>
  )
}