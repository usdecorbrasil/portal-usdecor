import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import { listarEnvios } from '@/lib/estoque/envios'
import FormEnvioTecido from '@/components/form-envio-tecido'
import EnviosTecido from '@/components/envios-tecido'
import { CAIXA, CABECALHO, CORPO, NUM, NOME, VAZIO } from '@/components/estilo-lista'

const m = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

/**
 * Tecido do cliente na estamparia: saldo por tecido, extrato e envios.
 * Tudo filtrado pelas políticas do banco — só vem o que é dele.
 */
export default async function TecidosPage() {
  const perfil = await lerPerfil()
  if (!perfil) redirect('/login')
  if (perfil.papel !== 'cliente') redirect('/admin/estoque')

  const supabase = await createClient()
  const [{ data: saldos }, { data: tecidos }, { data: movimentos }, envios] = await Promise.all([
    supabase.from('tecido_saldos').select('tecido_id, saldo_metros, ultimo_movimento'),
    supabase.from('tecidos').select('id, nome').eq('ativo', true).order('nome'),
    supabase
      .from('tecido_movimentos')
      .select('id, tecido_id, tipo, metros, observacao, criado_em, pedidos(numero)')
      .order('criado_em', { ascending: false })
      .limit(100),
    listarEnvios(),
  ])

  const nomeTecido = new Map((tecidos ?? []).map((t) => [t.id as string, t.nome as string]))
  const linhas = ((saldos ?? []) as { tecido_id: string; saldo_metros: number; ultimo_movimento: string | null }[])
    .map((s) => ({
      tecidoId: s.tecido_id,
      tecido: nomeTecido.get(s.tecido_id) ?? '—',
      saldo: Number(s.saldo_metros),
      ultimo: s.ultimo_movimento,
    }))
    .sort((a, b) => a.tecido.localeCompare(b.tecido))

  const ROTULO: Record<string, string> = { entrada: 'Entrada', consumo: 'Consumo', quebra: 'Quebra', ajuste: 'Ajuste' }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">Meus tecidos</h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-5">
        Quanto do seu tecido está na estamparia. Cada pedido estampado baixa a
        metragem impressa deste saldo; o que você envia entra depois da conferência.
      </p>

      <FormEnvioTecido tecidos={(tecidos ?? []).map((t) => ({ id: t.id as string, nome: t.nome as string }))} />

      <section className="mt-7">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          SALDO EM ESTOQUE
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        {linhas.length === 0 ? (
          <div className={VAZIO}>Nenhum tecido em estoque ainda.</div>
        ) : (
          <div className={CAIXA}>
            <div className={CABECALHO}>
              <span className="flex-1 min-w-0">Tecido</span>
              <span className="w-28 shrink-0 text-right">Saldo</span>
              <span className="w-24 shrink-0 text-right">Último mov.</span>
            </div>
            <div className={CORPO}>
              {linhas.map((l) => (
                <div key={l.tecidoId} className="flex items-center gap-2 px-2.5 py-1.5 bg-white">
                  <span aria-hidden className={'w-1 self-stretch -my-1.5 shrink-0 ' + (l.saldo <= 0 ? 'bg-[#B00063]' : l.saldo < 10 ? 'bg-[#C4A868]' : 'bg-[#8CB399]')} />
                  <span className={NOME + ' flex-1 min-w-0'}>{l.tecido}</span>
                  <span className={NUM + ' w-28 shrink-0 text-right font-semibold ' + (l.saldo <= 0 ? 'text-[#B00063]' : 'text-[#131A2E]')}>
                    {m(l.saldo)} m
                  </span>
                  <span className={NUM + ' w-24 shrink-0 text-right text-[#9B9A93]'}>
                    {l.ultimo ? new Date(l.ultimo).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <EnviosTecido envios={envios} modo="cliente" titulo="MEUS ENVIOS" />

      <section className="mt-7">
        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
          EXTRATO
          <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        {(movimentos ?? []).length === 0 ? (
          <div className={VAZIO}>Nenhuma movimentação ainda.</div>
        ) : (
          <div className={CAIXA}>
            <div className={CABECALHO}>
              <span className="w-16 shrink-0">Data</span>
              <span className="flex-1 min-w-0">Movimento</span>
              <span className="w-24 shrink-0 text-right">Metros</span>
            </div>
            <div className={CORPO}>
              {((movimentos ?? []) as unknown as {
                id: string
                tecido_id: string
                tipo: string
                metros: number
                observacao: string | null
                criado_em: string
                pedidos: { numero: number } | null
              }[]).map((mv) => {
                const metros = Number(mv.metros)
                const entra = mv.tipo === 'entrada' || (mv.tipo === 'ajuste' && metros > 0)
                return (
                  <div key={mv.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-white">
                    <span className={NUM + ' w-16 shrink-0 text-[#6E6E68]'}>
                      {new Date(mv.criado_em).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={NOME + ' block'}>
                        {ROTULO[mv.tipo] ?? mv.tipo} · {nomeTecido.get(mv.tecido_id) ?? '—'}
                        {mv.pedidos?.numero != null && ` · pedido #${mv.pedidos.numero}`}
                      </span>
                      {mv.observacao && (
                        <span className="block text-[10px] text-[#9B9A93] truncate">{mv.observacao}</span>
                      )}
                    </span>
                    <span className={NUM + ' w-24 shrink-0 text-right font-semibold ' + (entra ? 'text-[#2E7D4F]' : 'text-[#B00063]')}>
                      {entra ? '+' : '−'} {m(Math.abs(metros))} m
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
