import { createClient } from '@/lib/supabase/server'

/**
 * Lista de alterações de cadastro, lida de `auditoria` (docs/sql/010).
 *
 * A mesma peça serve o cliente e as Configurações: o que muda é o filtro.
 * Sem `entidadeId` mostra tudo da entidade — é o caso das Configurações, onde
 * a pergunta é "o que andou mudando aqui", não "neste registro".
 *
 * `recolhido` esconde a lista atrás de um botão. No pedido o histórico fica
 * sempre à vista, porque lá ele é parte do trabalho; no cadastro é consulta
 * eventual e ocupava a tela de quem só queria ver o telefone. É um
 * `<details>` nativo: abre e fecha sem JavaScript, e a página continua sendo
 * componente de servidor.
 */

const ROTULO_ACAO: Record<string, string> = {
  criou: 'Cadastro criado',
  editou: 'Alteração',
  ativou: 'Acesso ativado',
  desativou: 'Acesso desativado',
  arquivou: 'Arquivado',
  restaurou: 'Restaurado',
  senha: 'Senha redefinida',
  excluiu: 'Excluído',
  pagou: 'Pagamento registrado',
  estornou: 'Pagamento estornado',
  cancelou: 'Cancelado',
}

type Linha = {
  id: string
  acao: string
  campos: { campo: string; de: string | null; para: string | null }[] | null
  motivo: string | null
  criado_por: string | null
  created_at: string
}

function dataHora(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

export default async function HistoricoAlteracoes({
  entidade,
  entidadeId,
  titulo = 'ALTERAÇÕES',
  limite = 30,
  recolhido = false,
}: {
  entidade: string | string[]
  entidadeId?: string
  titulo?: string
  limite?: number
  recolhido?: boolean
}) {
  const supabase = await createClient()

  let consulta = supabase
    .from('auditoria')
    .select('id, acao, campos, motivo, criado_por, created_at')
    .order('created_at', { ascending: false })
    .limit(limite)

  consulta = Array.isArray(entidade)
    ? consulta.in('entidade', entidade)
    : consulta.eq('entidade', entidade)

  if (entidadeId) consulta = consulta.eq('entidade_id', entidadeId)

  const { data } = await consulta
  const linhas = (data ?? []) as unknown as Linha[]

  // Sem nada para mostrar e sem botão para abrir, o bloco não tem razão de
  // ocupar espaço. Recolhido, o botão fica: é ele que diz que existe histórico
  if (linhas.length === 0 && !recolhido) return null

  // Quem fez, numa consulta só. Sem nome a linha continua valendo: data e
  // conteúdo da mudança são o essencial
  const ids = [...new Set(linhas.map((l) => l.criado_por).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()

  if (ids.length) {
    const { data: perfis } = await supabase
      .from('profiles')
      .select('id, nome')
      .in('id', ids)

    perfis?.forEach((p) => {
      if (p.nome) nomes.set(p.id as string, p.nome as string)
    })
  }

  const lista = (
    <div className="bg-white border border-[#DDDCD5] rounded-sm divide-y divide-[#EFEEE8]">
      {linhas.length === 0 && (
        <p className="px-3 py-2.5 text-xs text-[#6E6E68]">
          Nenhuma alteração registrada ainda.
        </p>
      )}
      {linhas.map((l) => {
        const autor = l.criado_por ? nomes.get(l.criado_por) : null

        return (
          <div key={l.id} className="px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold tracking-tight">
                {ROTULO_ACAO[l.acao] ?? l.acao}
              </span>
              <span className="text-[10px] font-mono text-[#9B9A93] whitespace-nowrap">
                {dataHora(l.created_at)}
                {autor && ` · ${autor}`}
              </span>
            </div>

            {(l.campos ?? []).length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {(l.campos ?? []).map((c, i) => (
                  <li key={i} className="text-[11px] text-[#6E6E68] leading-relaxed">
                    <span className="text-[#131A2E]">{c.campo}</span>
                    {': '}
                    <span className="font-mono">{c.de ?? '—'}</span>
                    {' → '}
                    <span className="font-mono text-[#131A2E]">
                      {c.para ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {l.motivo && (
              <p className="text-[11px] italic text-[#6E6E68] mt-1 leading-relaxed">
                &ldquo;{l.motivo}&rdquo;
              </p>
            )}
          </div>
        )
      })}
    </div>
  )

  if (recolhido) {
    return (
      <details className="mt-6 group">
        <summary className="list-none cursor-pointer select-none inline-flex items-center gap-2 border border-[#DDDCD5] rounded-sm px-3 py-2 text-xs tracking-wide text-[#6E6E68] hover:border-[#0090D8] hover:text-[#0090D8] [&::-webkit-details-marker]:hidden">
          <span className="transition-transform group-open:rotate-90">›</span>
          HISTÓRICO DE ALTERAÇÕES
          <span className="font-mono text-[10px] bg-[#EEEDE7] rounded-sm px-1.5 py-0.5">
            {linhas.length}
          </span>
        </summary>
        <div className="mt-2">{lista}</div>
      </details>
    )
  }

  return (
    <div className="mt-6">
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9B9A93] mb-2">
        {titulo}
      </p>
      {lista}
    </div>
  )
}
