import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerPerfil } from '@/lib/auth/perfil'
import Equipe from './equipe'
import ConfigPagamento from './config-pagamento'
import ConfigNotificacoes from './config-notificacoes'
import IntegracaoBling from './integracao-bling'
import IntegracaoIa from './integracao-ia'
import {
  buscarConfigPagamento,
  buscarConfigNotificacoes,
} from '@/app/actions/configuracoes'
import { lerEstadoBling } from '@/lib/bling/cliente'
import HistoricoAlteracoes from '@/components/historico-alteracoes'

// "Tirar o limite do Bling de todos" passa cliente por cliente, ~1 s cada
export const maxDuration = 120

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

  const [configPagamento, configNotificacoes, estadoBling] = await Promise.all([
    buscarConfigPagamento(),
    buscarConfigNotificacoes(),
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
          NOTIFICAÇÕES
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <ConfigNotificacoes configAtual={configNotificacoes} />
      </div>

      <div className="mt-8">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          INTEGRAÇÕES
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <IntegracaoBling estado={estadoBling} />
        <IntegracaoIa configurada={!!process.env.ANTHROPIC_API_KEY} />
      </div>

      <div className="mt-8">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          HISTÓRICO
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        {/* Equipe e pagamento na mesma lista: é a pergunta que se faz aqui —
            o que andou mudando nas configurações, e por quem */}
        <HistoricoAlteracoes
          entidade={['configuracao', 'equipe']}
          recolhido
        />
      </div>
    </div>
  )
}