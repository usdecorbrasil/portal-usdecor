import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Trilha de alterações de cadastro — o que acontece fora do pedido.
 *
 * O pedido tem tabelas próprias (`pedido_ajustes`, `pedido_precos`,
 * `pedido_forma_pagamento_historico`, `pedido_nf_historico`), porque ali cada
 * mudança tem forma e consequência própria. Aqui é cadastro: a pergunta é
 * sempre "o que houve com este cliente / este usuário", e uma tabela genérica
 * responde isso sem multiplicar tabelas quase iguais.
 *
 * As ações gravam com chave de serviço, então o autor **não** vem do banco
 * (`auth.uid()` não existe nessa conexão): é lido da sessão aqui.
 */

export type Entidade = 'cliente' | 'equipe' | 'configuracao' | 'despesa' | 'suprimento'

export type Acao =
  | 'criou'
  | 'editou'
  | 'ativou'
  | 'desativou'
  | 'arquivou'
  | 'restaurou'
  | 'senha'
  | 'excluiu'

export type CampoAlterado = { campo: string; de: string | null; para: string | null }

/** Vazio, string em branco e nulo são a mesma coisa para efeito de comparação. */
function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * Compara dois conjuntos de campos e devolve só o que mudou, já com o rótulo
 * que aparece na tela.
 *
 * `rotulos` define o que interessa: campo que não estiver ali é ignorado, o
 * que evita registrar ruído como `updated_at`.
 */
export function diferencas(
  antes: Record<string, unknown> | null | undefined,
  depois: Record<string, unknown>,
  rotulos: Record<string, string>
): CampoAlterado[] {
  if (!antes) return []

  const mudou: CampoAlterado[] = []

  for (const [chave, rotulo] of Object.entries(rotulos)) {
    const de = texto(antes[chave])
    const para = texto(depois[chave])
    if (de !== para) mudou.push({ campo: rotulo, de, para })
  }

  return mudou
}

/**
 * Registra a alteração. **Nunca lança e nunca desfaz nada**: quando isto roda,
 * a mudança já foi salva — devolver erro seria mentir sobre o que aconteceu.
 * Falha aparece no log do servidor.
 */
export async function registrar({
  entidade,
  entidadeId,
  acao,
  campos = [],
  motivo,
}: {
  entidade: Entidade
  entidadeId: string | null
  acao: Acao
  campos?: CampoAlterado[]
  motivo?: string | null
}): Promise<void> {
  try {
    // Edição que não mudou nada não vira linha — senão o histórico enche de
    // "editou" sem conteúdo e esconde o que importa
    if (acao === 'editou' && campos.length === 0) return

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const admin = createAdminClient()

    const { error } = await admin.from('auditoria').insert({
      entidade,
      entidade_id: entidadeId,
      acao,
      campos,
      motivo: motivo ?? null,
      criado_por: user?.id ?? null,
    })

    if (error) console.error('[auditoria]', entidade, acao, error.message)
  } catch (e) {
    console.error('[auditoria]', entidade, acao, e)
  }
}

/** Rótulos do cadastro de cliente, na ordem em que aparecem no formulário. */
export const ROTULOS_CLIENTE: Record<string, string> = {
  razao_social: 'Razão social',
  cnpj: 'CNPJ',
  email: 'E-mail de acesso',
  contato: 'Contato',
  telefone: 'Telefone',
  inscricao_estadual: 'Inscrição estadual',
  indicador_ie: 'Indicador de IE',
  cep: 'CEP',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  municipio: 'Município',
  uf: 'UF',
  formas_pagamento: 'Formas de pagamento',
}

/** Rótulos do cadastro de quem é da equipe. */
export const ROTULOS_EQUIPE: Record<string, string> = {
  nome: 'Nome',
  email: 'E-mail de acesso',
  role: 'Papel',
}
