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

/**
 * Esquema "de fio": o que a IA devolve. A API de saída estruturada aceita no
 * máximo 16 campos com união de tipos (nullable é união) e este documento
 * passou de 24 quando entraram destinatário e tecido — a leitura quebrava com
 * HTTP 400 antes de ler a foto. Por isso aqui NADA é nullable: texto ausente
 * vem como "", número ausente como 0 e condição desconhecida como
 * "nao_informado". `normalizar()` converte para o `DocumentoLido` com null,
 * que é o que a conferência, a chave e o XML já usam.
 */
const ItemFio = z.object({
  descricao: z.string(),
  /** Código do item no documento, ou "" se não houver. */
  codigo: z.string(),
  quantidade: z.number(),
  /** UN, PC, KG, L, M…, ou "" se não houver. */
  unidade: z.string(),
  /** Valor unitário, ou 0 se só houver o total da linha. */
  valor_unitario: z.number(),
  valor_total: z.number(),
  /** Nome exato de uma categoria da lista enviada, ou "" se não der para dizer. */
  categoria: z.string(),
  /** Nome exato de um suprimento cadastrado que corresponde ao item, ou "". */
  suprimento: z.string(),
  /** Item é tecido de cliente (matéria-prima que o cliente manda estampar), não compra da empresa. */
  tecido_de_cliente: z.boolean(),
  /** Nome exato de um tecido cadastrado que corresponde ao item, ou "". */
  tecido: z.string(),
  confianca: z.number().min(0).max(1),
})

const CONDICOES = ['pago', 'debito', 'credito', 'boleto', 'a_pagar'] as const

const DocumentoFio = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO),
  fornecedor_nome: z.string(),
  /** CNPJ ou CPF só com dígitos, ou "". */
  fornecedor_doc: z.string(),
  /** Comprador (destinatário/tomador), quando o documento traz; senão "". */
  destinatario_nome: z.string(),
  /** CNPJ ou CPF do comprador, só dígitos, ou "". */
  destinatario_doc: z.string(),
  /** Quando a nota é de tecido de cliente: nome exato do cliente da lista, ou "". */
  tecido_cliente: z.string(),
  numero: z.string(),
  serie: z.string(),
  /** Chave de acesso de 44 dígitos, ou "". */
  chave_acesso: z.string(),
  /** AAAA-MM-DD, ou "". */
  emissao: z.string(),
  forma_pagamento: z.string(),
  /** Como a compra foi paga; nao_informado quando o documento não diz. */
  condicao_pagamento: z.enum([...CONDICOES, 'nao_informado']),
  /** Parcelas impressas no documento (quadro "Fatura/Duplicatas" da DANFE, vencimentos do boleto). */
  duplicatas: z.array(
    z.object({
      numero: z.string(),
      /** AAAA-MM-DD */
      vencimento: z.string(),
      valor: z.number(),
    })
  ),
  /** Valores do rodapé; 0 quando o documento não traz. */
  subtotal: z.number(),
  desconto: z.number(),
  frete: z.number(),
  impostos: z.number(),
  total: z.number(),
  itens: z.array(ItemFio),
  observacoes: z.string(),
  /** Confiança por campo do cabeçalho (0 a 1). */
  confianca: z.object({
    fornecedor: z.number().min(0).max(1),
    numero: z.number().min(0).max(1),
    emissao: z.number().min(0).max(1),
    total: z.number().min(0).max(1),
    itens: z.number().min(0).max(1),
  }),
})

/** O documento como o resto do app o conhece: campo ausente é null. */
export type ItemLido = Omit<z.infer<typeof ItemFio>, 'codigo' | 'unidade' | 'valor_unitario' | 'categoria' | 'suprimento' | 'tecido'> & {
  codigo: string | null
  unidade: string | null
  valor_unitario: number | null
  categoria: string | null
  suprimento: string | null
  tecido: string | null
}

export type DocumentoLido = Omit<
  z.infer<typeof DocumentoFio>,
  | 'fornecedor_nome' | 'fornecedor_doc' | 'destinatario_nome' | 'destinatario_doc' | 'tecido_cliente'
  | 'numero' | 'serie' | 'chave_acesso' | 'emissao' | 'forma_pagamento' | 'condicao_pagamento'
  | 'duplicatas' | 'subtotal' | 'desconto' | 'frete' | 'impostos' | 'total' | 'itens' | 'observacoes'
> & {
  fornecedor_nome: string | null
  fornecedor_doc: string | null
  destinatario_nome: string | null
  destinatario_doc: string | null
  tecido_cliente: string | null
  numero: string | null
  serie: string | null
  chave_acesso: string | null
  emissao: string | null
  forma_pagamento: string | null
  condicao_pagamento: (typeof CONDICOES)[number] | null
  duplicatas: { numero: string | null; vencimento: string; valor: number }[]
  subtotal: number | null
  desconto: number | null
  frete: number | null
  impostos: number | null
  total: number | null
  itens: ItemLido[]
  observacoes: string | null
}

const texto = (s: string) => (s.trim() === '' ? null : s.trim())
const valor = (n: number) => (n === 0 ? null : n)

/** Converte o formato de fio (sem null) no documento com null que a conferência usa. */
export function normalizar(d: z.infer<typeof DocumentoFio>): DocumentoLido {
  return {
    ...d,
    fornecedor_nome: texto(d.fornecedor_nome),
    fornecedor_doc: texto(d.fornecedor_doc),
    destinatario_nome: texto(d.destinatario_nome),
    destinatario_doc: texto(d.destinatario_doc),
    tecido_cliente: texto(d.tecido_cliente),
    numero: texto(d.numero),
    serie: texto(d.serie),
    chave_acesso: texto(d.chave_acesso),
    emissao: texto(d.emissao),
    forma_pagamento: texto(d.forma_pagamento),
    condicao_pagamento: d.condicao_pagamento === 'nao_informado' ? null : d.condicao_pagamento,
    duplicatas: d.duplicatas.map((p) => ({ ...p, numero: texto(p.numero) })),
    subtotal: valor(d.subtotal),
    desconto: valor(d.desconto),
    frete: valor(d.frete),
    impostos: valor(d.impostos),
    total: valor(d.total),
    observacoes: texto(d.observacoes),
    itens: d.itens.map((i) => ({
      ...i,
      codigo: texto(i.codigo),
      unidade: texto(i.unidade),
      valor_unitario: valor(i.valor_unitario),
      categoria: texto(i.categoria),
      suprimento: texto(i.suprimento),
      tecido: texto(i.tecido),
    })),
  }
}

export type EntradaLeitura = {
  /** Bytes do arquivo já comprimido. */
  conteudo: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  /** Nomes das categorias de gasto cadastradas, para a IA classificar. */
  categorias: string[]
  /** Nomes dos suprimentos cadastrados (com unidade), para casar itens. */
  suprimentos: string[]
  /** Tecidos cadastrados (estoque dos clientes), para reconhecer nota de tecido. */
  tecidos?: string[]
  /** Clientes ativos (razão social e CNPJ), para dizer de quem é o tecido. */
  clientes?: { nome: string; doc: string | null }[]
  /**
   * rapido = Haiku (padrão, ~R$ 0,01 por página); preciso = Opus (~R$ 0,40),
   * para reler uma nota que o rápido não entendeu.
   */
  modelo?: ModeloLeitura
  /** Releitura automática usa o preciso em esforço médio, para caber no tempo da tela. */
  esforco?: 'low' | 'medium' | 'high'
}

export type ModeloLeitura = 'rapido' | 'preciso'

/**
 * Versão das instruções abaixo. Vai gravada com cada nota (`despesas.versao_prompt`)
 * para comparar a taxa de acerto quando o texto mudar — mudou o texto, suba a versão.
 */
export const VERSAO_PROMPT = 'v4-2026-10-12'

export const MODELOS: Record<ModeloLeitura, { id: string; rotulo: string }> = {
  rapido: { id: 'claude-haiku-5-5', rotulo: 'rápido (Haiku)' },
  preciso: { id: 'claude-opus-5-5', rotulo: 'preciso (Opus)' },
}

export type ResultadoLeitura =
  | { ok: true; documento: DocumentoLido; modelo: ModeloLeitura }
  | { ok: false; erro: string }

/**
 * Instrução fixa. Vai em cache: só a imagem muda de uma leitura para outra.
 * Escrita para documentos brasileiros de uma estamparia por sublimação, com
 * as armadilhas que mais confundem leitura automática (vírgula decimal,
 * valor por item × total, desconto na última linha, nº do cupom × COO,
 * CNPJ do emitente × do destinatário).
 */
function instrucoes(categorias: string[], suprimentos: string[], tecidos: string[], clientes: { nome: string; doc: string | null }[]) {
  return `Você é o leitor de documentos de compra e despesa de uma estamparia por sublimação no Brasil (impressão de tecidos). Receberá a foto ou o PDF de UM documento e devolverá os dados dele, só os dados: nada de comentários.

CAMPO AUSENTE
- Nenhum campo aceita null. Texto que o documento não traz = "" (string vazia). Número que o documento não traz = 0. condicao_pagamento desconhecida = "nao_informado". Nunca invente valor para preencher.

TIPOS DE DOCUMENTO
- nfe: DANFE de NF-e (modelo 55). Tem "DANFE", chave de acesso de 44 dígitos, emitente e destinatário, tabela de produtos com NCM/CFOP, quadro de impostos.
- nfce: cupom fiscal eletrônico (NFC-e, modelo 65). Tem "NFC-e" ou "Documento Auxiliar", QR code, chave de 44 dígitos, itens em linhas.
- nfse: nota fiscal de serviço (prefeitura). Tem "NFS-e", código de verificação, ISS, descrição do serviço; normalmente sem itens.
- cupom: comprovante não fiscal (pedido, orçamento, maquininha, comanda).
- recibo: recibo manual ou impresso de pagamento.
- boleto: boleto bancário usado como comprovante de despesa (aluguel, energia, água, internet).
- outro: qualquer outro.

QUEM É O FORNECEDOR
- O fornecedor é o EMITENTE (quem vendeu/prestou), nunca o destinatário/tomador. Em DANFE o emitente está no cabeçalho; "DESTINATÁRIO/REMETENTE" é o comprador — ignore.
- A estamparia (compradora) pode aparecer como destinatário; não a devolva como fornecedor.
- destinatario_nome / destinatario_doc: o comprador ("DESTINATÁRIO/REMETENTE" na DANFE, "CONSUMIDOR"/"CPF/CNPJ do consumidor" na NFC-e, "TOMADOR" na NFS-e), só dígitos no documento. Sem comprador identificado, "" nos dois.
- fornecedor_doc: CNPJ (14 dígitos) ou CPF (11 dígitos), SÓ DÍGITOS. Se houver dois CNPJs, o do emitente. Se não estiver legível por inteiro, devolva "" — nunca complete dígitos.

NÚMEROS E DATAS
- Documentos brasileiros usam vírgula decimal e ponto de milhar: "1.234,56" = 1234.56. Devolva números com ponto decimal e sem separador de milhar.
- Datas em AAAA-MM-DD. "08/10/2026" = 2026-10-08 (dia/mês/ano, sempre). Use a data de EMISSÃO; se só houver data de vencimento (boleto), use-a e diga em observacoes.
- Chave de acesso: exatamente 44 dígitos, geralmente em grupos de 4. Devolva só se ler os 44 com segurança; senão "".
- numero: o número do documento (NF nº, "Nº" do cupom, número da NFS-e). Em NFC-e, "Nº" é o número; "Série" é a série; não use COO nem "Extrato nº".

ITENS
- Um item por linha de produto/serviço, na ordem do documento. Copie a descrição como está (pode abreviar só se cortada).
- quantidade, unidade (UN, PC, KG, L, ML, M, M2, RL, CX, PCT…), valor_unitario e valor_total do item. Se só houver o total da linha, valor_unitario = 0.
- Em cupom de supermercado/papelaria a linha costuma ser "descrição  qtd x unitário  total"; a quantidade pode vir na linha de cima ou de baixo.
- Desconto que aparece numa linha própria ("DESCONTO", "DESC.") NÃO é item: vai em desconto. Mesmo para "FRETE" (vai em frete) e "ACRÉSCIMO/JUROS" (some em impostos e diga em observacoes).
- Se o documento não tem itens (NFS-e, recibo, boleto), crie UM item com a descrição do serviço/despesa e o total.
- categoria: escolha UMA da lista abaixo pelo que o item é, não pelo fornecedor. Tinta de impressora/sublimática → Tinta; papel sublimático/transfer/bobina → Papel sublimático; tecido, malha, poliéster, oxford → Tecido; plástico, saco, caixa, fita → Embalagem; conta de luz → Energia; mão de obra, serviço, costura terceirizada → Serviços de terceiros. Se nenhuma couber, "".
- suprimento: se o item for claramente o MESMO produto de um dos suprimentos cadastrados (mesmo tipo e, quando houver, mesma cor/modelo), devolva o nome exato do suprimento; na dúvida, "". Nunca marque suprimento em serviço, energia ou aluguel.

TECIDO DE CLIENTE
- A estamparia estampa tecido que o CLIENTE manda (oxford, tactel, malha, poliéster, helanca, suplex, crepe, cetim…). Esse tecido NÃO é compra da empresa: é matéria-prima do cliente, que entra no estoque dele.
- tecido_de_cliente = true no item quando ele é tecido (metragem ou rolo de tecido). Tinta, papel, embalagem e serviço são sempre false.
- tecido: se o item for um dos tecidos cadastrados (mesmo nome ou nome claramente equivalente — "OXFORD 100% POL" é "Oxford"), devolva o nome exato da lista; senão "".
- tecido_cliente (no cabeçalho): quando há item de tecido, diga de qual cliente é. Procure o nome ou o CNPJ de um cliente da lista no destinatário, no remetente, nas observações ("tecido de", "ref. cliente", "p/") ou no próprio nome do emitente (o cliente pode ser quem emite a remessa). Devolva o nome exato da lista; se nenhum bater, "". Sem item de tecido, "".

TOTAIS
- subtotal, desconto, frete e impostos: 0 quando o documento não traz. subtotal = soma dos itens antes de desconto/frete; total = valor final a pagar impresso no documento ("VALOR TOTAL", "TOTAL A PAGAR", "VALOR LÍQUIDO"). Nunca calcule o total: copie o impresso.
- impostos = soma do que se soma ao preço além de itens e frete: IPI, ICMS-ST, SEGURO, OUTRAS DESPESAS ACESSÓRIAS, juros. ICMS "incluso" e PIS/COFINS "aproximados" NÃO entram.
- Confira: soma dos itens − desconto + frete + impostos deve dar o total. Se não bater, mantenha os valores lidos e baixe confianca.itens para 0.5 ou menos.

PAGAMENTO
- forma_pagamento: o texto do documento sobre pagamento, como está ("Cartão de Crédito", "PIX", "28/56 DDL", "Boleto"); "" se não houver.
- condicao_pagamento, uma destas ou nao_informado se o documento não disser:
  - pago: pago na hora em dinheiro, Pix, transferência ou depósito ("Dinheiro", "PIX", "Troco", recibo de pagamento quitado).
  - debito: cartão de débito.
  - credito: cartão de crédito (inclusive parcelado na maquininha, "Crédito 3x").
  - boleto: boleto bancário ou duplicatas com vencimento (quadro "FATURA/DUPLICATAS" na DANFE).
  - a_pagar: venda a prazo sem boleto nem cartão ("a prazo", "fiado", "faturado" sem duplicatas).
  Em NFC-e o meio vem em "FORMA DE PAGAMENTO" no rodapé. Em NF-e, "Pagamento à vista" com meio "Dinheiro"/"PIX" é pago; "a prazo" com duplicatas é boleto.
- duplicatas: cada parcela impressa (número, vencimento AAAA-MM-DD, valor), na ordem. Na DANFE fica no quadro "FATURA / DUPLICATAS" ("001 15/11/2026 1.234,56"). Num boleto avulso, uma duplicata com o vencimento e o valor do documento. Sem parcelas impressas, lista vazia — nunca invente vencimentos.

CONFIANÇA (0 a 1), por campo e por item
- 1.0: legível, sem ambiguidade. 0.8: legível com pequena dúvida (dígito parecido, parte cortada). 0.5: parcialmente ilegível ou inferido. 0.2: chute. Campo vazio ("" ou 0) por ausência no documento não baixa a confiança.
- Foto borrada, inclinada, com reflexo ou cortada: baixe a confiança dos campos afetados. Não invente nada para "completar" o documento.

Categorias de gasto disponíveis (nome exato ou ""): ${categorias.join('; ')}.
${tecidos.length ? `Tecidos cadastrados (nome exato ou ""): ${tecidos.join('; ')}.` : 'Não há tecidos cadastrados: devolva "" em "tecido" (tecido_de_cliente continua valendo).'}
${clientes.length ? `Clientes da estamparia (nome exato ou "" em tecido_cliente): ${clientes.map((c) => (c.doc ? `${c.nome} (CNPJ ${c.doc})` : c.nome)).join('; ')}.` : ''}
${
  suprimentos.length
    ? `Suprimentos cadastrados (nome exato ou ""): ${suprimentos.join('; ')}.`
    : 'Não há suprimentos cadastrados: devolva "" em "suprimento" em todos os itens.'
}`
}

export async function lerDocumento(entrada: EntradaLeitura): Promise<ResultadoLeitura> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, erro: 'Leitura por IA não configurada: falta ANTHROPIC_API_KEY na Vercel.' }
  }

  const modelo = entrada.modelo ?? 'rapido'
  const client = new Anthropic()
  const base64 = entrada.conteudo.toString('base64')

  const bloco: Anthropic.ContentBlockParam =
    entrada.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: entrada.mediaType, data: base64 } }

  try {
    const resposta = await client.messages.parse({
      model: MODELOS[modelo].id,
      max_tokens: 16000,
      // Rápido: esforço baixo (custo por página na casa do centavo). Preciso: alto.
      output_config: { effort: entrada.esforco ?? (modelo === 'preciso' ? 'high' : 'low'), format: zodOutputFormat(DocumentoFio) },
      system: [{ type: 'text', text: instrucoes(entrada.categorias, entrada.suprimentos, entrada.tecidos ?? [], entrada.clientes ?? []), cache_control: { type: 'ephemeral' } }],
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
      return { ok: false, erro: 'Não foi possível entender o documento. Tente uma foto mais nítida, reler com o modelo preciso, ou preencher à mão.' }
    }
    return { ok: true, documento: normalizar(resposta.parsed_output), modelo }
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

/**
 * Confere se a chave da IA funciona, com uma pergunta mínima ao modelo rápido
 * (custo de fração de centavo). Usado pelo botão de teste em Configurações.
 */
export async function testarChaveIa(): Promise<{ ok: true; detalhe: string } | { ok: false; erro: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, erro: 'Falta a variável ANTHROPIC_API_KEY na Vercel.' }
  }
  try {
    const resposta = await new Anthropic().messages.create({
      model: MODELOS.rapido.id,
      max_tokens: 64,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Responda apenas: OK' }],
    })
    return { ok: true, detalhe: `Chave aceita. O modelo rápido (${resposta.model}) respondeu.` }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, erro: 'A chave foi recusada: confira se foi colada inteira e se não foi revogada.' }
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, erro: 'A chave não tem permissão para usar o modelo. Confira a conta na Anthropic.' }
    if (e instanceof Anthropic.RateLimitError) return { ok: false, erro: 'Limite de uso atingido (ou conta sem crédito). Confira o saldo na Anthropic.' }
    if (e instanceof Anthropic.APIError) return { ok: false, erro: `Falha (${e.status}): ${e.message}` }
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao testar a chave.' }
  }
}

