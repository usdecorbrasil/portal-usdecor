/**
 * Leitura do XML da NF-e / NFC-e (layout SEFAZ 4.00) direto para o formato
 * que a conferência de nota usa. Puro: nada de IA, nada de banco. Os dados
 * vêm exatos do documento assinado, então a confiança é 1 em tudo.
 *
 * O XML tem estrutura fixa e conhecida, por isso a leitura é por tags, sem
 * biblioteca: `infNFe > emit / dest / det[] / total / cobr / pag`. Aceita o
 * arquivo "procNFe" (com protocolo, o que o fornecedor manda) ou só a "NFe".
 */
import type { DocumentoLido } from './ler-documento'

const CATEGORIA_POR_DESCRICAO: [RegExp, string][] = [
  [/tinta|ink|sublim[aá]tic[ao]\s*(tinta)?/i, 'Tinta'],
  [/papel|transfer|bobina/i, 'Papel sublimático'],
  [/tecido|malha|poli[eé]ster|oxford|tactel|helanca|suplex|crepe/i, 'Tecido'],
  [/embalag|saco|caixa|fita|pl[aá]stico|bobina pl/i, 'Embalagem'],
]

/** Texto de uma tag direta (sem namespace), ou null. */
function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`))
  return m ? desescapar(m[1].trim()) : null
}

/** O bloco inteiro de uma tag (com o conteúdo), ou null. */
function bloco(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>[\\s\\S]*?</${nome}>`))
  return m ? m[0] : null
}

/** Todos os blocos de uma tag repetida (det, dup, detPag). */
function blocos(xml: string, nome: string): string[] {
  return xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>[\\s\\S]*?</${nome}>`, 'g')) ?? []
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

const numero = (s: string | null) => (s == null || s === '' ? null : Number(s))
const dinheiro = (s: string | null) => {
  const n = numero(s)
  return n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100
}

/** Meio de pagamento da NF-e (tPag) → condição do portal. */
function condicaoDoPagamento(tPag: string | null, temDuplicatas: boolean): DocumentoLido['condicao_pagamento'] {
  if (temDuplicatas) return 'boleto'
  switch (tPag) {
    case '01': // dinheiro
    case '16': // depósito
    case '17': // PIX
    case '18': // transferência
    case '19': // programa de fidelidade
      return 'pago'
    case '03':
      return 'credito'
    case '04':
      return 'debito'
    case '15': // boleto
      return 'boleto'
    case '90': // sem pagamento
      return null
    default:
      return temDuplicatas ? 'boleto' : null
  }
}

const ROTULO_PAG: Record<string, string> = {
  '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '05': 'Crédito loja',
  '10': 'Vale alimentação', '11': 'Vale refeição', '12': 'Vale presente', '13': 'Vale combustível',
  '15': 'Boleto bancário', '16': 'Depósito bancário', '17': 'PIX', '18': 'Transferência', '19': 'Fidelidade',
  '90': 'Sem pagamento', '99': 'Outros',
}

export type ResultadoXml = { ok: true; documento: DocumentoLido } | { ok: false; erro: string }

export function lerXmlNfe(xml: string): ResultadoXml {
  if (!/<infNFe[\s>]/.test(xml)) {
    return { ok: false, erro: 'Este XML não é uma NF-e ou NFC-e (não tem o bloco infNFe).' }
  }
  const inf = bloco(xml, 'infNFe') ?? xml
  const ide = bloco(inf, 'ide') ?? ''
  const emit = bloco(inf, 'emit') ?? ''
  const dest = bloco(inf, 'dest') ?? ''
  const total = bloco(bloco(inf, 'total') ?? '', 'ICMSTot') ?? ''
  const cobr = bloco(inf, 'cobr') ?? ''
  const pag = bloco(inf, 'pag') ?? ''

  const chave = (inf.match(/<infNFe[^>]*\bId="NFe(\d{44})"/) ?? [])[1] ?? null
  const modelo = tag(ide, 'mod')
  const tipo: DocumentoLido['tipo'] = modelo === '65' ? 'nfce' : 'nfe'

  // dhEmi é AAAA-MM-DDTHH:MM:SS-03:00; dEmi (layout antigo) é só a data
  const emissao = (tag(ide, 'dhEmi') ?? tag(ide, 'dEmi') ?? '').slice(0, 10) || null

  const itens: DocumentoLido['itens'] = blocos(inf, 'det').map((det) => {
    const prod = bloco(det, 'prod') ?? det
    const descricao = tag(prod, 'xProd') ?? ''
    const categoria = CATEGORIA_POR_DESCRICAO.find(([re]) => re.test(descricao))?.[1] ?? null
    return {
      descricao,
      codigo: tag(prod, 'cProd'),
      quantidade: numero(tag(prod, 'qCom')) ?? 1,
      unidade: tag(prod, 'uCom'),
      valor_unitario: numero(tag(prod, 'vUnCom')),
      valor_total: dinheiro(tag(prod, 'vProd')) ?? 0,
      categoria,
      suprimento: null,
      confianca: 1,
    }
  })

  const duplicatas = blocos(cobr, 'dup').map((dup) => ({
    numero: tag(dup, 'nDup'),
    vencimento: (tag(dup, 'dVenc') ?? '').slice(0, 10),
    valor: dinheiro(tag(dup, 'vDup')) ?? 0,
  })).filter((d) => d.vencimento)

  const tPag = tag(bloco(pag, 'detPag') ?? pag, 'tPag')
  const vProd = dinheiro(tag(total, 'vProd'))
  const vNF = dinheiro(tag(total, 'vNF'))
  // O que se soma ao preço além de itens e frete: IPI, ST, seguro, outras despesas
  const impostos =
    Math.round(
      ((dinheiro(tag(total, 'vIPI')) ?? 0) +
        (dinheiro(tag(total, 'vST')) ?? 0) +
        (dinheiro(tag(total, 'vSeg')) ?? 0) +
        (dinheiro(tag(total, 'vOutro')) ?? 0)) * 100
    ) / 100

  const docEmit = tag(emit, 'CNPJ') ?? tag(emit, 'CPF')
  const docDest = tag(dest, 'CNPJ') ?? tag(dest, 'CPF')
  const enderEmit = bloco(emit, 'enderEmit') ?? ''
  const observacoes = [
    tag(bloco(inf, 'infAdic') ?? '', 'infCpl'),
    tag(enderEmit, 'xMun') && tag(enderEmit, 'UF') ? `${tag(enderEmit, 'xMun')}/${tag(enderEmit, 'UF')}` : null,
  ].filter(Boolean).join(' · ') || null

  return {
    ok: true,
    documento: {
      tipo,
      fornecedor_nome: tag(emit, 'xNome'),
      fornecedor_doc: docEmit,
      destinatario_nome: tag(dest, 'xNome'),
      destinatario_doc: docDest,
      numero: tag(ide, 'nNF'),
      serie: tag(ide, 'serie'),
      chave_acesso: chave,
      emissao,
      forma_pagamento: tPag ? ROTULO_PAG[tPag] ?? `Pagamento ${tPag}` : null,
      condicao_pagamento: condicaoDoPagamento(tPag, duplicatas.length > 0),
      duplicatas,
      subtotal: vProd,
      desconto: dinheiro(tag(total, 'vDesc')),
      frete: dinheiro(tag(total, 'vFrete')),
      impostos,
      total: vNF,
      itens,
      observacoes,
      confianca: { fornecedor: 1, numero: 1, emissao: 1, total: 1, itens: 1 },
    },
  }
}
