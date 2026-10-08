import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lerPerfil } from '@/lib/auth/perfil'
import BotaoVoltar from '@/components/botao-voltar'
import Captura from './captura'

export const maxDuration = 60

/**
 * Nova despesa: foto ou arquivo → leitura por IA → conferência → salvar.
 * A mesma tela serve para digitar à mão; a IA só pré-preenche.
 */
export default async function NovaDespesaPage() {
  const perfil = await lerPerfil()
  if (!perfil || !perfil.veValores) redirect('/admin/estoque')
  const supabase = await createClient()
  const [{ data: categorias }, { data: suprimentos }] = await Promise.all([
    supabase.from('categorias_despesa').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('suprimentos').select('id, nome, unidade').eq('ativo', true).order('nome'),
  ])

  return (
    <div>
      <BotaoVoltar href="/admin/estoque/despesas" rotulo="DESPESAS E NOTAS" />
      <h1 className="text-2xl font-bold tracking-tight text-[#131A2E] mt-2">Nova nota</h1>
      <p className="text-sm text-[#6E6E68] mt-1 mb-5 leading-relaxed">
        Tire a foto da nota, do cupom ou do recibo, ou anexe o PDF. A leitura por IA preenche os
        campos; confira o que vier marcado em amarelo antes de salvar.
      </p>
      <Captura
        categorias={(categorias ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string }))}
        suprimentos={(suprimentos ?? []).map((s) => ({ id: s.id as string, nome: s.nome as string, unidade: s.unidade as string }))}
      />
    </div>
  )
}
