import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TrocarSenha from './trocar-senha'
import EditarContato from './editar-contato'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatarCnpj(c: string) {
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function dataBr(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default async function ContaPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select(
      'nome, clientes(razao_social, cnpj, email, contato, telefone, limite_credito)'
    )
    .eq('id', user.id)
    .single()

  const empresa = perfil?.clientes as unknown as {
    razao_social: string
    cnpj: string
    email: string
    contato: string | null
    telefone: string | null
    limite_credito: number
  } | null

  // As políticas do banco já restringem ao próprio cliente
  const [{ data: pedidos }, { data: parcelas }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('total, cancelado_em, pedido_status_historico(status, created_at)')
      .is('cancelado_em', null),
    supabase
      .from('pedido_parcelas')
      .select('numero, valor, vencimento, pago_em, pedidos!inner(numero, id, cancelado_em)')
      .is('pago_em', null)
      .is('pedidos.cancelado_em', null)
      .order('vencimento'),
  ])

  // Mesma regra do limite de crédito: conta o que ainda não foi fechado
  const emAberto = ((pedidos ?? []) as any[])
    .filter((p) => {
      const ultimo = (p.pedido_status_historico ?? [])
        .slice()
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      return (ultimo?.status ?? 'aguardando') !== 'fechado'
    })
    .reduce((a, p) => a + Number(p.total), 0)

  const limite = Number(empresa?.limite_credito ?? 0)
  const disponivel = Math.max(0, limite - emAberto)
  const usoPercent = limite > 0 ? Math.min(100, (emAberto / limite) * 100) : 0

  const hoje = new Date(new Date().toDateString())
  const boletos = ((parcelas ?? []) as any[]).map((p) => ({
    pedidoId: p.pedidos?.id as string,
    pedidoNumero: Number(p.pedidos?.numero ?? 0),
    parcela: Number(p.numero),
    valor: Number(p.valor),
    vencimento: p.vencimento as string,
    vencida: new Date(p.vencimento) < hoje,
  }))

  const totalAberto = boletos.reduce((a, b) => a + b.valor, 0)
  const vencidos = boletos.filter((b) => b.vencida)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
        Minha conta
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-6">
        Seus dados, crédito e cobranças
      </p>

      <Titulo>CRÉDITO</Titulo>

      {limite > 0 ? (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-sm text-[#6E6E68]">Disponível</span>
            <strong className="font-mono text-2xl">R$ {brl(disponivel)}</strong>
          </div>

          <div className="h-2 bg-[#EEEDE7] rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full ${
                usoPercent >= 100 ? 'bg-[#B00063]' : 'bg-[#131A2E]'
              }`}
              style={{ width: `${usoPercent}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-[#6E6E68] mt-2 font-mono">
            <span>em aberto R$ {brl(emAberto)}</span>
            <span>limite R$ {brl(limite)}</span>
          </div>

          {usoPercent >= 100 && (
            <p className="text-xs text-[#B00063] mt-2 leading-relaxed">
              Limite comprometido. Novos pedidos podem ser feitos à vista até a
              quitação dos pedidos em aberto.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-[#6E6E68] bg-white border border-[#DDDCD5] rounded-sm p-4">
          Sem limite de crédito definido. Fale com a Best Color Tecidos se
          quiser trabalhar com pagamento parcelado.
        </p>
      )}

      <Titulo>BOLETOS EM ABERTO</Titulo>

      {boletos.length === 0 ? (
        <p className="text-sm text-[#6E6E68] bg-white border border-[#DDDCD5] rounded-sm p-4">
          Nenhuma cobrança em aberto.
        </p>
      ) : (
        <>
          {vencidos.length > 0 && (
            <div className="bg-[#FBEAF0] border-l-4 border-[#B00063] rounded-r-sm p-3 mb-3">
              <p className="text-sm font-semibold text-[#B00063]">
                {vencidos.length} parcela{vencidos.length > 1 ? 's' : ''} vencida
                {vencidos.length > 1 ? 's' : ''}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            {boletos.map((b, i) => (
              <Link
                key={i}
                href={`/pedidos/${b.pedidoId}`}
                className="flex items-center justify-between gap-3 bg-white border border-[#DDDCD5] rounded-sm px-3 py-2.5 hover:border-[#131A2E]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    Pedido {b.pedidoNumero}
                  </div>
                  <span
                    className={`text-xs ${
                      b.vencida ? 'text-[#B00063]' : 'text-[#6E6E68]'
                    }`}
                  >
                    parcela {b.parcela} · vence {dataBr(b.vencimento)}
                    {b.vencida && ' · vencida'}
                  </span>
                </div>
                <span className="font-mono font-bold text-sm shrink-0">
                  R$ {brl(b.valor)}
                </span>
              </Link>
            ))}
          </div>

          <div className="flex justify-between items-baseline mt-3 pt-3 border-t-2 border-[#131A2E]">
            <span className="font-semibold tracking-tight text-sm">
              TOTAL EM ABERTO
            </span>
            <strong className="font-mono text-xl">R$ {brl(totalAberto)}</strong>
          </div>
        </>
      )}

      <Titulo>CADASTRO</Titulo>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 space-y-2">
        <Linha rotulo="Empresa" valor={empresa?.razao_social ?? '—'} />
        <Linha
          rotulo="CNPJ"
          valor={empresa?.cnpj ? formatarCnpj(empresa.cnpj) : '—'}
        />
        <Linha rotulo="E-mail de acesso" valor={user.email ?? '—'} />

        <p className="text-xs text-[#6E6E68] pt-2 leading-relaxed">
          Empresa, CNPJ e e-mail de acesso vão para a nota fiscal e para o
          login. Para corrigi-los, fale com a Best Color Tecidos.
        </p>
      </div>

      <Titulo>CONTATO</Titulo>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
        <EditarContato
          contato={empresa?.contato ?? null}
          telefone={empresa?.telefone ?? null}
        />
      </div>

      <Titulo>ALTERAR SENHA</Titulo>

      <div className="bg-white border border-[#DDDCD5] rounded-sm p-4">
        <TrocarSenha />
      </div>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-8 mb-3 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-[#DDDCD5]" />
    </h2>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[#6E6E68] shrink-0">{rotulo}</span>
      <span className="text-right truncate">{valor}</span>
    </div>
  )
}
