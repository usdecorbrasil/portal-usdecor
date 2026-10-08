'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { lerDespesa, salvarDespesa, type Rascunho, type DadosDespesa } from '@/app/actions/despesas'
import { TIPOS_DOCUMENTO } from '@/lib/despesas/tipos'

/**
 * Captura + conferência. Duas etapas:
 *  1. escolher a foto (câmera ou galeria) ou o PDF; a imagem é reduzida aqui
 *     mesmo (lado maior 1600 px, JPEG 82%) antes de subir — original não sobe;
 *  2. formulário com todos os campos editáveis, pré-preenchido pela IA ou em
 *     branco. Campo com confiança abaixo de 0,7 fica amarelo.
 */

type Categoria = { id: string; nome: string }
type Suprimento = { id: string; nome: string; unidade: string }

type ItemForm = {
  descricao: string
  codigo: string
  quantidade: string
  unidade: string
  valorUnitario: string
  valorTotal: string
  categoriaId: string
  suprimentoId: string
  confianca: number | null
}

type Form = {
  tipo: (typeof TIPOS_DOCUMENTO)[number]
  fornecedorNome: string
  fornecedorDoc: string
  numero: string
  serie: string
  chaveAcesso: string
  emissao: string
  formaPagamento: string
  subtotal: string
  desconto: string
  frete: string
  impostos: string
  total: string
  observacoes: string
  itens: ItemForm[]
}

const ROTULO_TIPO: Record<(typeof TIPOS_DOCUMENTO)[number], string> = {
  nfe: 'NF-e (DANFE)', nfce: 'NFC-e (cupom fiscal)', nfse: 'NFS-e (serviço)', cupom: 'Cupom não fiscal', recibo: 'Recibo', boleto: 'Boleto', outro: 'Outro',
}

const LIMIAR = 0.7
const campo = 'border rounded-sm px-2 py-1.5 text-sm outline-none focus:border-[#131A2E] bg-white w-full'
const normal = 'border-[#DDDCD5]'
const duvida = 'border-[#C79600] bg-[#FFFBEE]'
const rotulo = 'block text-[10px] font-mono tracking-wider text-[#6E6E68]'
const botao = 'rounded-sm px-4 py-2.5 text-xs font-bold tracking-wide disabled:opacity-50'

const num = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const txt = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const itemVazio = (): ItemForm => ({ descricao: '', codigo: '', quantidade: '1', unidade: 'un', valorUnitario: '', valorTotal: '', categoriaId: '', suprimentoId: '', confianca: null })

function formVazio(): Form {
  return {
    tipo: 'outro', fornecedorNome: '', fornecedorDoc: '', numero: '', serie: '', chaveAcesso: '',
    emissao: new Date().toISOString().slice(0, 10), formaPagamento: '', subtotal: '', desconto: '', frete: '', impostos: '', total: '',
    observacoes: '', itens: [itemVazio()],
  }
}

/** Reduz a foto no aparelho: lado maior 1600 px, JPEG 82%. PDF passa direto. */
async function comprimir(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith('image/')) return arquivo
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const maior = Math.max(bitmap.width, bitmap.height)
    const fator = maior > 1600 ? 1600 / maior : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * fator)
    canvas.height = Math.round(bitmap.height * fator)
    const ctx = canvas.getContext('2d')
    if (!ctx) return arquivo
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob) return arquivo
    return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return arquivo
  }
}

export default function Captura({ categorias, suprimentos }: { categorias: Categoria[]; suprimentos: Suprimento[] }) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<'captura' | 'conferencia'>('captura')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [origem, setOrigem] = useState<'camera' | 'upload'>('upload')
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [form, setForm] = useState<Form>(formVazio())
  const [confianca, setConfianca] = useState<Record<string, number>>({})
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)
  const [pendente, iniciar] = useTransition()
  const inputCamera = useRef<HTMLInputElement>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  async function escolher(f: File | undefined, de: 'camera' | 'upload') {
    if (!f) return
    setErro('')
    const comprimido = await comprimir(f)
    setArquivo(comprimido)
    setOrigem(de)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(comprimido.type.startsWith('image/') ? URL.createObjectURL(comprimido) : null)
  }

  async function enviar(usarIa: boolean) {
    if (!arquivo) return
    setErro('')
    setLendo(true)
    const fd = new FormData()
    fd.set('arquivo', arquivo)
    fd.set('origem', origem)
    fd.set('ia', usarIa ? 'sim' : 'nao')
    const r = await lerDespesa(fd)
    setLendo(false)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    setRascunho(r.rascunho)
    const d = r.rascunho.documento
    if (d) {
      const porNome = (nome: string | null, lista: { id: string; nome: string }[]) =>
        nome ? lista.find((x) => x.nome.toLowerCase() === nome.toLowerCase().replace(/\s*\(.*\)$/, ''))?.id ?? '' : ''
      setForm({
        tipo: d.tipo,
        fornecedorNome: d.fornecedor_nome ?? '',
        fornecedorDoc: d.fornecedor_doc ?? '',
        numero: d.numero ?? '',
        serie: d.serie ?? '',
        chaveAcesso: d.chave_acesso ?? '',
        emissao: d.emissao ?? new Date().toISOString().slice(0, 10),
        formaPagamento: d.forma_pagamento ?? '',
        subtotal: txt(d.subtotal),
        desconto: txt(d.desconto),
        frete: txt(d.frete),
        impostos: txt(d.impostos),
        total: txt(d.total),
        observacoes: d.observacoes ?? '',
        itens: d.itens.length
          ? d.itens.map((i) => ({
              descricao: i.descricao,
              codigo: i.codigo ?? '',
              quantidade: txt(i.quantidade) || '1',
              unidade: i.unidade ?? 'un',
              valorUnitario: txt(i.valor_unitario),
              valorTotal: txt(i.valor_total),
              categoriaId: porNome(i.categoria, categorias),
              suprimentoId: porNome(i.suprimento, suprimentos),
              confianca: i.confianca,
            }))
          : [itemVazio()],
      })
      setConfianca(d.confianca)
    } else {
      setForm(formVazio())
      setConfianca({})
      if (r.rascunho.erroLeitura) setErro(r.rascunho.erroLeitura + ' O arquivo foi guardado; preencha abaixo.')
    }
    setEtapa('conferencia')
  }

  const somaItens = form.itens.reduce((s, i) => s + num(i.valorTotal), 0)
  const totalCalculado = somaItens - num(form.desconto) + num(form.frete) + num(form.impostos)
  const totalInformado = num(form.total)
  const diferenca = Math.round((totalInformado - totalCalculado) * 100) / 100

  function setItem(idx: number, patch: Partial<ItemForm>) {
    setForm((f) => {
      const itens = f.itens.slice()
      const atual = { ...itens[idx], ...patch }
      // Quantidade × unitário preenche o total quando ele está vazio ou veio da conta
      if ((patch.quantidade !== undefined || patch.valorUnitario !== undefined) && atual.valorUnitario) {
        atual.valorTotal = txt(Math.round(num(atual.quantidade) * num(atual.valorUnitario) * 100) / 100)
      }
      itens[idx] = atual
      return { ...f, itens }
    })
  }

  function salvar() {
    setErro('')
    const dados: DadosDespesa = {
      arquivoPath: rascunho?.arquivoPath ?? null,
      origem: rascunho?.origem ?? origem,
      modo: rascunho?.modo ?? 'manual',
      tipo: form.tipo,
      fornecedorNome: form.fornecedorNome || null,
      fornecedorDoc: form.fornecedorDoc || null,
      numero: form.numero || null,
      serie: form.serie || null,
      chaveAcesso: form.chaveAcesso || null,
      emissao: form.emissao,
      formaPagamento: form.formaPagamento || null,
      subtotal: form.subtotal ? num(form.subtotal) : null,
      desconto: num(form.desconto),
      frete: num(form.frete),
      impostos: num(form.impostos),
      total: totalInformado,
      observacoes: form.observacoes || null,
      confianca: Object.keys(confianca).length ? confianca : null,
      itens: form.itens
        .filter((i) => i.descricao.trim() || i.valorTotal)
        .map((i) => ({
          descricao: i.descricao,
          codigo: i.codigo || null,
          quantidade: num(i.quantidade),
          unidade: i.unidade || null,
          valorUnitario: i.valorUnitario ? num(i.valorUnitario) : null,
          valorTotal: num(i.valorTotal),
          categoriaId: i.categoriaId || null,
          suprimentoId: i.suprimentoId || null,
          confianca: i.confianca,
        })),
    }
    iniciar(async () => {
      const r = await salvarDespesa(dados)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      router.push('/admin/estoque/despesas')
      router.refresh()
    })
  }

  const cls = (chave: string) => campo + ' ' + ((confianca[chave] ?? 1) < LIMIAR ? duvida : normal)

  /* ------------------------------ etapa 1 ------------------------------ */
  if (etapa === 'captura') {
    return (
      <div>
        <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files?.[0], 'camera')} />
        <input ref={inputArquivo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => escolher(e.target.files?.[0], 'upload')} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => inputCamera.current?.click()} className="bg-white border-2 border-dashed border-[#131A2E] rounded-sm py-8 text-sm font-semibold tracking-wide hover:bg-[#FAFAF7]">
            📷 TIRAR FOTO
            <span className="block text-xs font-normal text-[#6E6E68] mt-1">enquadre a nota inteira, com luz</span>
          </button>
          <button onClick={() => inputArquivo.current?.click()} className="bg-white border-2 border-dashed border-[#DDDCD5] rounded-sm py-8 text-sm font-semibold tracking-wide hover:border-[#131A2E]">
            📎 ANEXAR ARQUIVO
            <span className="block text-xs font-normal text-[#6E6E68] mt-1">JPG, PNG ou PDF até 10 MB</span>
          </button>
        </div>

        {arquivo && (
          <div className="mt-4 bg-white border border-[#DDDCD5] rounded-sm p-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Prévia da nota" className="max-h-80 mx-auto rounded-sm" />
            ) : (
              <p className="text-sm text-center text-[#6E6E68]">{arquivo.name}</p>
            )}
            <p className="text-[11px] text-[#9B9A93] text-center mt-2">{(arquivo.size / 1024).toFixed(0)} KB · {arquivo.type}</p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button onClick={() => enviar(true)} disabled={lendo} className={botao + ' flex-1 bg-[#D8007A] text-white'}>
                {lendo ? 'LENDO A NOTA… (até 30 s)' : 'LER COM IA E CONFERIR'}
              </button>
              <button onClick={() => enviar(false)} disabled={lendo} className={botao + ' flex-1 border border-[#131A2E] bg-white'}>
                PREENCHER À MÃO
              </button>
              <button onClick={() => { setArquivo(null); setPreview(null) }} disabled={lendo} className={botao + ' text-[#6E6E68]'}>
                TROCAR
              </button>
            </div>
          </div>
        )}

        {erro && <p className="text-sm text-[#B00063] bg-white border border-[#B00063] rounded-sm p-3 mt-4">{erro}</p>}
      </div>
    )
  }

  /* ------------------------------ etapa 2 ------------------------------ */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div>
        {rascunho?.modo === 'ia' && (
          <p className="text-xs text-[#0090D8] bg-[#E6EDEE] rounded-sm px-3 py-2 mb-3">
            Lida por IA. Campos em amarelo tiveram leitura incerta: confira com a imagem ao lado.
          </p>
        )}
        {erro && <p className="text-sm text-[#B00063] bg-white border border-[#B00063] rounded-sm p-3 mb-3">{erro}</p>}

        <div className="bg-white border border-[#DDDCD5] rounded-sm p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className={rotulo + ' col-span-2'}>TIPO
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Form['tipo'] })} className={campo + ' ' + normal}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
          </label>
          <label className={rotulo}>EMISSÃO
            <input type="date" value={form.emissao} onChange={(e) => setForm({ ...form, emissao: e.target.value })} className={cls('emissao')} />
          </label>
          <label className={rotulo}>Nº / SÉRIE
            <span className="flex gap-1">
              <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={cls('numero')} placeholder="nº" />
              <input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} className={campo + ' ' + normal + ' w-16'} placeholder="série" />
            </span>
          </label>
          <label className={rotulo + ' col-span-2 sm:col-span-3'}>FORNECEDOR
            <input value={form.fornecedorNome} onChange={(e) => setForm({ ...form, fornecedorNome: e.target.value })} className={cls('fornecedor')} />
          </label>
          <label className={rotulo}>CNPJ / CPF
            <input value={form.fornecedorDoc} onChange={(e) => setForm({ ...form, fornecedorDoc: e.target.value })} inputMode="numeric" className={cls('fornecedor')} />
          </label>
          <label className={rotulo + ' col-span-2 sm:col-span-3'}>CHAVE DE ACESSO (44 dígitos)
            <input value={form.chaveAcesso} onChange={(e) => setForm({ ...form, chaveAcesso: e.target.value })} inputMode="numeric" className={campo + ' ' + normal + ' font-mono text-xs'} />
          </label>
          <label className={rotulo}>PAGAMENTO
            <input value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} className={campo + ' ' + normal} placeholder="pix, boleto…" />
          </label>
        </div>

        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-5 mb-2 flex items-center gap-2">
          ITENS <span className="flex-1 h-px bg-[#DDDCD5]" />
          <span className="font-mono normal-case tracking-normal text-[#9B9A93]">{form.itens.length}</span>
        </h2>
        <div className="space-y-2">
          {form.itens.map((i, idx) => {
            const incerto = i.confianca != null && i.confianca < LIMIAR
            return (
              <div key={idx} className={'bg-white border rounded-sm p-2 grid grid-cols-6 sm:grid-cols-12 gap-1.5 ' + (incerto ? 'border-[#C79600]' : 'border-[#DDDCD5]')}>
                <label className={rotulo + ' col-span-6 sm:col-span-5'}>DESCRIÇÃO
                  <input value={i.descricao} onChange={(e) => setItem(idx, { descricao: e.target.value })} className={campo + ' ' + (incerto ? duvida : normal)} />
                </label>
                <label className={rotulo + ' col-span-2 sm:col-span-2'}>QTD
                  <input value={i.quantidade} onChange={(e) => setItem(idx, { quantidade: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
                </label>
                <label className={rotulo + ' col-span-1'}>UN
                  <input value={i.unidade} onChange={(e) => setItem(idx, { unidade: e.target.value })} className={campo + ' ' + normal} />
                </label>
                <label className={rotulo + ' col-span-3 sm:col-span-2'}>UNITÁRIO
                  <input value={i.valorUnitario} onChange={(e) => setItem(idx, { valorUnitario: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
                </label>
                <label className={rotulo + ' col-span-3 sm:col-span-2'}>TOTAL
                  <input value={i.valorTotal} onChange={(e) => setItem(idx, { valorTotal: e.target.value })} inputMode="decimal" className={campo + ' ' + (incerto ? duvida : normal) + ' font-semibold'} />
                </label>
                <label className={rotulo + ' col-span-3 sm:col-span-5'}>CATEGORIA DO GASTO
                  <select value={i.categoriaId} onChange={(e) => setItem(idx, { categoriaId: e.target.value })} className={campo + ' ' + (i.categoriaId ? normal : duvida)}>
                    <option value="">— escolher —</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label className={rotulo + ' col-span-3 sm:col-span-6'}>ENTRA NO ESTOQUE COMO
                  <select value={i.suprimentoId} onChange={(e) => setItem(idx, { suprimentoId: e.target.value })} className={campo + ' ' + normal}>
                    <option value="">— só despesa —</option>
                    {suprimentos.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.unidade})</option>)}
                  </select>
                </label>
                <div className="col-span-6 sm:col-span-1 flex items-end justify-end">
                  <button onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== idx) })} className="text-xs text-[#B00063] hover:underline" title="remover item">remover</button>
                </div>
              </div>
            )
          })}
        </div>
        <button onClick={() => setForm({ ...form, itens: [...form.itens, itemVazio()] })} className="mt-2 text-xs text-[#0090D8] hover:underline">+ adicionar item</button>

        <div className="bg-white border border-[#DDDCD5] rounded-sm p-3 mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
          <label className={rotulo}>SUBTOTAL
            <input value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
          </label>
          <label className={rotulo}>DESCONTO
            <input value={form.desconto} onChange={(e) => setForm({ ...form, desconto: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
          </label>
          <label className={rotulo}>FRETE
            <input value={form.frete} onChange={(e) => setForm({ ...form, frete: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
          </label>
          <label className={rotulo}>IMPOSTOS
            <input value={form.impostos} onChange={(e) => setForm({ ...form, impostos: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
          </label>
          <label className={rotulo}>TOTAL
            <input value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} inputMode="decimal" className={cls('total') + ' font-bold'} />
          </label>
          <p className={'col-span-2 sm:col-span-5 text-xs ' + (Math.abs(diferenca) > 0.01 ? 'text-[#B00063]' : 'text-[#2E7D4F]')}>
            Itens R$ {brl(somaItens)} − desconto + frete + impostos = R$ {brl(totalCalculado)}
            {Math.abs(diferenca) > 0.01 ? ` · difere do total em R$ ${brl(Math.abs(diferenca))}. Confira antes de salvar.` : ' · confere com o total.'}
          </p>
          <label className={rotulo + ' col-span-2 sm:col-span-5'}>OBSERVAÇÕES
            <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className={campo + ' ' + normal} />
          </label>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <button onClick={salvar} disabled={pendente || totalInformado <= 0} className={botao + ' flex-1 bg-[#131A2E] text-white'}>
            {pendente ? 'SALVANDO…' : 'SALVAR DESPESA'}
          </button>
          <button onClick={() => { setEtapa('captura'); setErro('') }} disabled={pendente} className={botao + ' border border-[#131A2E] bg-white'}>
            VOLTAR
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 self-start">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Nota" className="w-full rounded-sm border border-[#DDDCD5]" />
        ) : (
          <div className="border border-dashed border-[#DDDCD5] rounded-sm p-6 text-center text-xs text-[#6E6E68]">{arquivo?.name ?? 'sem prévia'}</div>
        )}
      </aside>
    </div>
  )
}
