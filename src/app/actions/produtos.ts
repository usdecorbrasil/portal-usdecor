'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Medida opcional, só referência — não entra em nenhum cálculo de valor */
const medidaBr = (campo: string) =>
  z.string().trim()
    .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
    .refine(
      (v) => v === null || (!isNaN(v) && v > 0 && v <= 1000),
      `${campo} inválida`
    )

const camposBase = {
  sku: z.string().trim().toUpperCase()
        .regex(/^[A-Z0-9._-]{1,60}$/, 'SKU aceita letras, números, ponto, hífen e sublinhado'),
  nome: z.string().trim().min(1).max(200),
  largura: medidaBr('Largura'),
  altura: medidaBr('Altura'),
}

const schemaCriar = z.object({
  cliente_id: z.string().uuid(),
  catalogo_id: z.string().uuid('Selecione uma coleção'),
  ...camposBase,
})

const schemaEditar = z.object({
  id: z.string().uuid(),
  catalogo_id: z.string().uuid('Selecione uma coleção'),
  ...camposBase,
})

const IMAGEM_MAX = 500 * 1024

type Resultado = { ok: true } | { ok: false; erro: string }

async function exigirAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles').select('role, ativo').eq('id', user.id).single()

  return !!perfil && perfil.ativo && (perfil.role === 'admin' || perfil.role === 'financeiro')
}

function lerCampos(formData: FormData) {
  return {
    sku: formData.get('sku'),
    nome: formData.get('nome'),
    largura: formData.get('largura') ?? '',
    altura: formData.get('altura') ?? '',
  }
}

function validarImagem(imagem: FormDataEntryValue | null, obrigatoria: boolean) {
  if (!(imagem instanceof File) || imagem.size === 0) {
    return obrigatoria ? 'Selecione a imagem da arte.' : null
  }
  if (imagem.size > IMAGEM_MAX) {
    return 'Imagem acima do limite. Recarregue a página e tente de novo.'
  }
  if (imagem.type !== 'image/webp') {
    return 'Formato inesperado. Recarregue a página e tente de novo.'
  }
  return null
}

export async function criarProduto(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaCriar.safeParse({
    cliente_id: formData.get('cliente_id'),
    catalogo_id: formData.get('catalogo_id'),
    ...lerCampos(formData),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const imagem = formData.get('imagem')
  const erroImagem = validarImagem(imagem, true)
  if (erroImagem) return { ok: false, erro: erroImagem }

  const dados = parsed.data
  const admin = createAdminClient()

  const { data: catalogo } = await admin
    .from('catalogos').select('cliente_id').eq('id', dados.catalogo_id).single()

  if (!catalogo) return { ok: false, erro: 'Coleção não encontrada.' }
  if (catalogo.cliente_id !== dados.cliente_id) {
    return { ok: false, erro: 'A coleção pertence a outro cliente.' }
  }

  const { data: produto, error } = await admin
    .from('produtos')
    .insert({ ...dados, preco: 0, ativo: false })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Este SKU já existe no catálogo deste cliente.' }
    }
    return { ok: false, erro: 'Não foi possível cadastrar a arte.' }
  }

  const caminho = `${dados.cliente_id}/${produto.id}.webp`

  const { error: erroUpload } = await admin.storage
    .from('artes')
    .upload(caminho, imagem as File, { contentType: 'image/webp', upsert: true })

  if (erroUpload) {
    await admin.from('produtos').delete().eq('id', produto.id)
    return { ok: false, erro: 'Não foi possível enviar a imagem.' }
  }

  await admin.from('produtos')
    .update({ imagem_path: caminho })
    .eq('id', produto.id)

  revalidatePath('/admin/catalogo')
  return { ok: true }
}

export async function editarProduto(
  _prev: unknown,
  formData: FormData
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const parsed = schemaEditar.safeParse({
    id: formData.get('id'),
    catalogo_id: formData.get('catalogo_id'),
    ...lerCampos(formData),
  })

  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message }
  }

  const imagem = formData.get('imagem')
  const enviouImagem = imagem instanceof File && imagem.size > 0
  const erroImagem = validarImagem(imagem, false)
  if (erroImagem) return { ok: false, erro: erroImagem }

  const { id, ...dados } = parsed.data
  const admin = createAdminClient()

  const { data: atual } = await admin
    .from('produtos')
    .select('cliente_id, imagem_path')
    .eq('id', id)
    .single()

  if (!atual) return { ok: false, erro: 'Arte não encontrada.' }

  const { data: catalogo } = await admin
    .from('catalogos').select('cliente_id').eq('id', dados.catalogo_id).single()

  if (!catalogo || catalogo.cliente_id !== atual.cliente_id) {
    return { ok: false, erro: 'A coleção pertence a outro cliente.' }
  }

  const { error } = await admin.from('produtos').update(dados).eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'Este SKU já existe no catálogo deste cliente.' }
    }
    return { ok: false, erro: 'Não foi possível salvar as alterações.' }
  }

  if (enviouImagem) {
    const caminho = atual.imagem_path ?? `${atual.cliente_id}/${id}.webp`

    const { error: erroUpload } = await admin.storage
      .from('artes')
      .upload(caminho, imagem as File, { contentType: 'image/webp', upsert: true })

    if (erroUpload) {
      return { ok: false, erro: 'Dados salvos, mas a imagem não pôde ser trocada.' }
    }

    if (!atual.imagem_path) {
      await admin.from('produtos').update({ imagem_path: caminho }).eq('id', id)
    }
  }

  revalidatePath('/admin/catalogo')
  return { ok: true }
}

export async function alternarAtivo(
  produtoId: string,
  ativo: boolean
): Promise<Resultado> {
  if (!(await exigirAdmin())) return { ok: false, erro: 'Acesso negado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('produtos')
    .update({ ativo })
    .eq('id', produtoId)

  if (error) return { ok: false, erro: 'Não foi possível alterar o status.' }

  revalidatePath('/admin/catalogo')
  return { ok: true }
}