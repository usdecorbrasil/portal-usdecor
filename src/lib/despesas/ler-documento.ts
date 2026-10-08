import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

/**
 * Leitura de nota fiscal, cupom ou recibo por imagem (ou PDF) com o Claude.
 *
 * Princípio: a IA só pré-preenche. O resultado vai para a tela de
 * conferência, onde a equipe corrige e salva. Nada daqui grava no banco.
 * Cada campo volta com uma confiança de 0 a 1; a tela destaca o que vier
 * abaixo de 0,7.
 */

import { TIPOS_DOCUMENTO } from './tipos'
export { TIPOS_DOCUMENTO }

const ItemLido = z.object({
  descricao: z.string(),
  codigo: z.string().nullable(),
  quantidade: z.number(),
  unidade: z.string().nullable(),
  valor_unitario: z.number().nullable(),
  valor_total: z.number(),
  /** Nome exato de uma categoria da lista enviada, ou null se não der para dizer. */
  categoria: z.string().nullable(),
  /** Nome exato de um suprimento cadastrado que corresponde ao item, ou null. */
  suprimento: z.string().nullable(),
  confianca: z.number().min(0).max(1),
})

const DocumentoLido = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO),
  fornecedor_nome: z.string().nullable(),
  /** CNPJ ou CPF só com dígitos. */
  fornecedor_doc: z.string().nullable(),
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  /** Chave de acesso de 44 dígitos, se houver. */
  chave_acesso: z.string().nullable(),
  /** AAAA-MM-DD */
  emissao: z.string().nullable(),
  forma_pagamento: z.string().nullable(),
  subtotal: z.number().nullable(),
  desconto: z.number().nullable(),
  frete: z.number().nullable(),
  impostos: z.number().nullable(),
  total: z.number().nullable(),
  itens: z.array(ItemLido),
  observacoes: z.string().nullable(),
  /** Confiança por campo do cabeçalho (0 a 1). */
  confianca: z.object({
    fornecedor: z.number().min(0).max(1),
    numero: z.number().min(0).max(1),
    emissao: z.number().min(0).max(1),
    total: z.number().min(0).max(1),
    itens: z.number().min(0).max(1),
  }),
})

export type DocumentoLido = z.infer<typeof DocumentoLido>
export type ItemLido = z.infer<typeof ItemLido>

export type EntradaLeitura = {
  /** Bytes do arquivo já comprimido. */
  conteudo: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  /** Nomes das categorias de gasto cadastradas, para a IA classificar. */
  categorias: string[]
  /** Nomes dos suprimentos cadastrados (com unidade), para casar itens. */
  suprimentos: string[]
}

export type ResultadoLeitura =
  | { ok: true; documento: DocumentoLido; modelo: string }
  | { ok: false; erro: string }

const MODELO = 'claude-opus-5-5'

function instrucoes(categorias: string[], suprimentos: string[]) {
  return [
    'Você lê documentos de compra e despesa de uma estamparia por sublimação no Brasil:',
    'nota fiscal eletrônica (NF-e / DANFE), cupom fiscal (NFC-e), nota de serviço (NFS-e),',
    'cupom não fiscal, recibo, boleto. Extraia os dados exatamente como estão no documento,',
    'em reais, com ponto decimal. Datas em AAAA-MM-DD. CNPJ/CPF só com dígitos.',
    'Chave de acesso só se houver 44 dígitos legíveis. Não invente: campo que não está no',
    'documento volta null. Se houver vários itens, liste todos, um por linha; se o documento',
    'não tem itens (recibo de serviço, boleto), crie um item só com a descrição e o total.',
    'Some os itens e confira com o total; se não bater, mantenha o total impresso e reduza a',
    'confiança de "itens". Confiança: 1 = legível e inequívoco; abaixo de 0,7 = precisa conferir.',
    '',
    'Categorias de gasto disponíveis (use o nome exato ou null): ' + categorias.join('; ') + '.',
    suprimentos.length
      ? 'Suprimentos em estoque (use o nome exato quando o item for claramente o mesmo produto, senão null): ' +
        suprimentos.join('; ') + '.'
      : 'Não há suprimentos cadastrados: devolva null em "suprimento".',
    'Tinta sublimática, papel sublimático, tecido para estampa e embalagem são suprimentos típicos.',
  ].join('\n')
}

export async function lerDocumento(entrada: EntradaLeitura): Promise<ResultadoLeitura> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, erro: 'Leitura por IA não configurada: falta ANTHROPIC_API_KEY na Vercel.' }
  }

  const client = new Anthropic()
  const base64 = entrada.conteudo.toString('base64')

  const bloco: Anthropic.ContentBlockParam =
    entrada.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: entrada.mediaType, data: base64 } }

  try {
    const resposta = await client.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(DocumentoLido) },
      system: [{ type: 'text', text: instrucoes(entrada.categorias, entrada.suprimentos), cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [bloco, { type: 'text', text: 'Leia este documento e devolva os dados estruturados.' }],
        },
      ],
    })

    if (resposta.stop_reason === 'refusal') {
      return { ok: false, erro: 'A leitura foi recusada pelo modelo. Preencha à mão.' }
    }
    if (!resposta.parsed_output) {
      return { ok: false, erro: 'Não foi possível entender o documento. Tente uma foto mais nítida ou preencha à mão.' }
    }
    return { ok: true, documento: resposta.parsed_output, modelo: resposta.model }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, erro: 'Chave da IA inválida (ANTHROPIC_API_KEY).' }
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, erro: 'Muitas leituras seguidas. Aguarde um minuto e tente de novo.' }
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, erro: `Falha na leitura (${e.status}): ${e.message}` }
    }
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha na leitura.' }
  }
}
