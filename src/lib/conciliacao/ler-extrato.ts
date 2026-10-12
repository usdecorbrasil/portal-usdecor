import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { MODELOS, type ModeloLeitura } from '@/lib/despesas/ler-documento'
import type { ExtratoLido } from './tipos'

/**
 * Leitura de extrato bancário ou fatura de cartão por IA (PDF, imagem ou CSV
 * exportado). OFX não passa por aqui. Mesma regra do leitor de notas: o
 * esquema de fio não tem null (limite de 16 uniões da API) e a IA só lê — a
 * conciliação quem faz é a tela, com a equipe.
 */
export const VERSAO_PROMPT_EXTRATO = 'v1-2026-10-12'

const LancamentoFio = z.object({
  /** AAAA-MM-DD */
  data: z.string(),
  descricao: z.string(),
  /** Sempre positivo. */
  valor: z.number(),
  tipo: z.enum(['entrada', 'saida']),
  /** Nº do documento, ou "". */
  documento: z.string(),
})

const ExtratoFio = z.object({
  tipo: z.enum(['banco', 'cartao']),
  /** Banco ou emissor do cartão, ou "". */
  origem: z.string(),
  /** AAAA-MM-DD ou "". */
  periodo_inicio: z.string(),
  periodo_fim: z.string(),
  lancamentos: z.array(LancamentoFio),
})

const texto = (s: string) => (s.trim() === '' ? null : s.trim())

function normalizar(d: z.infer<typeof ExtratoFio>): ExtratoLido {
  return {
    tipo: d.tipo,
    origem: texto(d.origem),
    periodoInicio: texto(d.periodo_inicio),
    periodoFim: texto(d.periodo_fim),
    lancamentos: d.lancamentos
      .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.data) && l.valor > 0)
      .map((l) => ({ data: l.data, descricao: l.descricao.replace(/\s+/g, ' ').trim() || 'Lançamento', valor: Math.round(l.valor * 100) / 100, tipo: l.tipo, documento: texto(l.documento) })),
  }
}

const INSTRUCOES = `Você lê extratos bancários (conta corrente) e faturas de cartão de crédito de uma empresa no Brasil e devolve os lançamentos, só os dados.

CAMPO AUSENTE: nenhum campo aceita null. Texto ausente = "" (string vazia).

TIPO DO DOCUMENTO
- banco: extrato de conta corrente/poupança (saldo, lançamentos com débito e crédito, Pix, TED, boleto, tarifa).
- cartao: fatura de cartão de crédito (compras, parcelas "02/03", "pagamento recebido", encargos).

LANÇAMENTOS — um por linha de movimento, na ordem do documento
- data: AAAA-MM-DD. Datas brasileiras são dia/mês/ano. Na fatura de cartão, use a data da compra que aparece na linha.
- descricao: o texto da linha como está (estabelecimento, nome do pagador/recebedor, histórico). Mantenha "PARC 02/03" e nomes.
- valor: sempre POSITIVO, com ponto decimal. "1.234,56" = 1234.56.
- tipo: no extrato bancário, entrada = crédito (dinheiro que entrou: Pix recebido, TED recebida, depósito, liquidação de boleto/cobrança), saida = débito (pagamento, Pix enviado, boleto pago, compra no débito, tarifa, saque). Sinal negativo, coluna "D" ou "débito" indicam saída. Na fatura de cartão, compra/encargo = saida; "pagamento recebido", estorno e crédito = entrada.
- documento: número do documento/autenticação quando há; senão "".
- NÃO inclua linhas de saldo ("SALDO ANTERIOR", "SALDO DO DIA", "SALDO FINAL", "SUBTOTAL", "TOTAL DA FATURA", "LIMITE"), cabeçalhos nem totais. Só movimentos.
- Se o arquivo for CSV/texto, cada linha é um lançamento; descubra pelas colunas qual é data, descrição e valor.

CABEÇALHO
- origem: nome do banco ou do emissor do cartão ("Itaú", "Nubank", "Sicoob"), ou "".
- periodo_inicio / periodo_fim: período do extrato ou da fatura (AAAA-MM-DD), ou "".

Não invente lançamentos. Linha ilegível: pule.`

export type ResultadoExtrato = { ok: true; extrato: ExtratoLido; modelo: ModeloLeitura } | { ok: false; erro: string }

export async function lerExtrato(entrada: {
  conteudo: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'text/csv' | 'text/plain'
  modelo?: ModeloLeitura
}): Promise<ResultadoExtrato> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, erro: 'Leitura por IA não configurada: falta ANTHROPIC_API_KEY na Vercel. Importe o OFX do banco.' }
  const modelo = entrada.modelo ?? 'rapido'
  const client = new Anthropic()
  const bloco: Anthropic.ContentBlockParam =
    entrada.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: entrada.conteudo.toString('base64') } }
      : entrada.mediaType === 'text/csv' || entrada.mediaType === 'text/plain'
        ? { type: 'text', text: 'Conteúdo do arquivo:\n\n' + entrada.conteudo.toString('utf8').slice(0, 200000) }
        : { type: 'image', source: { type: 'base64', media_type: entrada.mediaType, data: entrada.conteudo.toString('base64') } }
  try {
    const resposta = await client.messages.parse({
      model: MODELOS[modelo].id,
      max_tokens: 32000,
      output_config: { effort: modelo === 'preciso' ? 'high' : 'low', format: zodOutputFormat(ExtratoFio) },
      system: [{ type: 'text', text: INSTRUCOES, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [bloco, { type: 'text', text: 'Leia este extrato e devolva os lançamentos.' }] }],
    })
    if (resposta.stop_reason === 'refusal') return { ok: false, erro: 'A leitura foi recusada pelo modelo.' }
    if (resposta.stop_reason === 'max_tokens') return { ok: false, erro: 'O extrato é longo demais para uma leitura. Divida o período ou importe o OFX do banco.' }
    if (!resposta.parsed_output) return { ok: false, erro: 'Não foi possível entender o extrato. Tente o OFX do banco ou o modelo preciso.' }
    const extrato = normalizar(resposta.parsed_output)
    if (!extrato.lancamentos.length) return { ok: false, erro: 'A leitura não encontrou lançamentos. Confira o arquivo ou importe o OFX.' }
    return { ok: true, extrato, modelo }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, erro: 'Chave da IA inválida (ANTHROPIC_API_KEY).' }
    if (e instanceof Anthropic.RateLimitError) return { ok: false, erro: 'Muitas leituras seguidas. Aguarde um minuto e tente de novo.' }
    if (e instanceof Anthropic.APIError) return { ok: false, erro: `Falha na leitura (${e.status}): ${e.message}` }
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha na leitura.' }
  }
}
