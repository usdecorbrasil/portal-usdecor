/**
 * Leitor de OFX (extrato bancário e fatura de cartão exportados do banco).
 * Puro, sem biblioteca: o OFX 1.x é SGML com tags sem fechamento e o 2.x é
 * XML — os dois têm os mesmos nomes de campo, então basta procurar por tag.
 * Nada de IA: os dados vêm exatos.
 */
import type { ExtratoLido, LancamentoLido } from './tipos'

function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() || null : null
}

/** AAAAMMDD[HHMMSS[.XXX]][TZ] → AAAA-MM-DD */
function dataOfx(s: string | null): string | null {
  const m = (s ?? '').match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function numeroOfx(s: string | null): number {
  if (!s) return NaN
  // Bancos brasileiros às vezes mandam "1234,56"
  const t = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '')
  return Number(t)
}

/** OFX costuma vir em ISO-8859-1 (CHARSET:1252). */
export function decodificarOfx(bytes: Uint8Array): string {
  const cabecalho = new TextDecoder('latin1').decode(bytes.slice(0, 400))
  const utf8 = /ENCODING:UTF-8|encoding="utf-8"/i.test(cabecalho)
  return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(bytes)
}

export type ResultadoOfx = { ok: true; extrato: ExtratoLido } | { ok: false; erro: string }

export function lerOfx(texto: string): ResultadoOfx {
  if (!/<OFX>/i.test(texto)) return { ok: false, erro: 'Este arquivo não é um OFX (não tem o bloco <OFX>).' }
  const ehCartao = /<CCSTMTRS>/i.test(texto)
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>\s*<\/BANKTRANLIST>|$)/gi) ?? []
  const lancamentos: LancamentoLido[] = []
  for (const b of blocos) {
    const valor = numeroOfx(tag(b, 'TRNAMT'))
    const data = dataOfx(tag(b, 'DTPOSTED'))
    if (!data || !Number.isFinite(valor) || valor === 0) continue
    const memo = tag(b, 'MEMO')
    const nome = tag(b, 'NAME')
    const descricao = [nome, memo].filter((x) => x && x !== nome || x === nome).filter(Boolean).join(' · ') || tag(b, 'TRNTYPE') || 'Lançamento'
    lancamentos.push({
      data,
      descricao: descricao.replace(/\s+/g, ' ').trim(),
      valor: Math.round(Math.abs(valor) * 100) / 100,
      tipo: valor < 0 ? 'saida' : 'entrada',
      documento: tag(b, 'FITID') ?? tag(b, 'CHECKNUM'),
    })
  }
  if (!lancamentos.length) return { ok: false, erro: 'O OFX não tem lançamentos (<STMTTRN>).' }
  const origem = tag(texto, 'ORG') ?? (tag(texto, 'BANKID') ? `Banco ${tag(texto, 'BANKID')}` : null)
  return {
    ok: true,
    extrato: {
      tipo: ehCartao ? 'cartao' : 'banco',
      origem,
      periodoInicio: dataOfx(tag(texto, 'DTSTART')) ?? lancamentos.map((l) => l.data).sort()[0] ?? null,
      periodoFim: dataOfx(tag(texto, 'DTEND')) ?? lancamentos.map((l) => l.data).sort().at(-1) ?? null,
      lancamentos,
    },
  }
}
