'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { lerDespesa, relerDespesa, salvarDespesa, type Rascunho, type DadosDespesa, type DuplicataProvavel } from '@/app/actions/despesas'
import { criarSuprimento } from '@/app/actions/suprimentos'
import CameraNota from './camera-nota'
import { comprimir } from '@/lib/despesas/comprimir'
import { TIPOS_DOCUMENTO } from '@/lib/despesas/tipos'
import {
  CONDICOES,
  ROTULO_CONDICAO,
  MAX_PARCELAS_CONTA,
  quitadaNaCompra,
  gerarParcelas,
  validarParcelas,
  primeiroVencimentoPadrao,
  type Condicao,
} from '@/lib/contas-pagar/condicoes'
import { UNIDADES, type Unidade } from '@/lib/suprimentos/unidades'
import { sugerirVinculo, parecidos, type VinculoAnterior } from '@/lib/suprimentos/sugerir-vinculo'
import { paraNumeroBr } from '@/lib/numero'
import { hojeBrasilia } from '@/lib/datas'
import { divergenciasDaChave, corrigirPelaChave } from '@/lib/despesas/chave'
import { avisoDaEmissao } from '@/lib/despesas/conferir'
import { chaveAcessoValida } from '@/lib/despesas/validar'

/**
 * Captura + conferência. Duas etapas:
 *  1. escolher a foto (câmera ou galeria) ou o PDF; a imagem é reduzida aqui
 *     mesmo (lado maior 1600 px, JPEG 82%) antes de subir — original não sobe;
 *  2. formulário com todos os campos editáveis, pré-preenchido pela IA ou em
 *     branco. Campo com confiança abaixo de 0,7 fica amarelo.
 * A leitura usa o modelo rápido (centavo por página); "reler com o modelo
 * preciso" roda o Opus sobre o mesmo arquivo, sem fotografar de novo.
 */

type Categoria = { id: string; nome: string }
type Suprimento = { id: string; nome: string; unidade: string }

/** Cadastro rápido de suprimento a partir de um item da nota. */
type NovoSuprimento = { nome: string; unidade: Unidade; categoriaId: string; consumoPorMetro: string }

const NOVO = '__novo__'

/** Traduz a unidade escrita na nota (LT, RL, MTS…) para uma das unidades do estoque. */
function unidadeDoEstoque(u: string): Unidade {
  const x = u.trim().toLowerCase().replace(/\./g, '')
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(x)) return 'L'
  if (['ml'].includes(x)) return 'mL'
  if (['kg', 'kgs', 'quilo'].includes(x)) return 'kg'
  if (['g', 'gr', 'grama', 'gramas'].includes(x)) return 'g'
  if (['m', 'mt', 'mts', 'metro', 'metros'].includes(x)) return 'm'
  if (['rl', 'rolo', 'rolos'].includes(x)) return 'rolo'
  if (['cx', 'caixa', 'caixas'].includes(x)) return 'cx'
  if (['pct', 'pc', 'pacote', 'pacotes'].includes(x)) return 'pct'
  return 'un'
}

/** Categorias que costumam ser estoque — item delas sem suprimento ganha o aviso. */
const ehDeEstoque = (categoria: string | undefined) => !!categoria && /tinta|papel|embalag|suprimento|insumo/i.test(categoria)

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
  /** Por que o vínculo foi feito sozinho (leitura ou histórico); vazio quando foi à mão. */
  origemVinculo: string
  /** Quem confere disse "não é este" para a sugestão. */
  semSugestao: boolean
}

type Form = {
  tipo: (typeof TIPOS_DOCUMENTO)[number]
  fornecedorNome: string
  fornecedorDoc: string
  destinatarioNome: string
  destinatarioDoc: string
  numero: string
  serie: string
  chaveAcesso: string
  emissao: string
  formaPagamento: string
  /** Como a nota foi paga — obrigatório, gera as contas a pagar. */
  condicao: Condicao | ''
  /** Parcelas a pagar (vencimento AAAA-MM-DD, valor em texto). Vazio quando já pago. */
  parcelas: { vencimento: string; valor: string }[]
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
  const n = paraNumeroBr(s)
  return Number.isFinite(n) ? n : 0
}
const txt = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const hoje = () => hojeBrasilia()

const itemVazio = (): ItemForm => ({ descricao: '', codigo: '', quantidade: '1', unidade: 'un', valorUnitario: '', valorTotal: '', categoriaId: '', suprimentoId: '', confianca: null, origemVinculo: '', semSugestao: false })

function formVazio(): Form {
  return {
    tipo: 'outro', fornecedorNome: '', fornecedorDoc: '', destinatarioNome: '', destinatarioDoc: '', numero: '', serie: '', chaveAcesso: '',
    emissao: hojeBrasilia(), formaPagamento: '', condicao: '', parcelas: [], subtotal: '', desconto: '', frete: '', impostos: '', total: '',
    observacoes: '', itens: [itemVazio()],
  }
}

export default function Captura({
  categorias,
  suprimentos: suprimentosIniciais,
  historico,
  destinatarios,
}: {
  categorias: Categoria[]
  suprimentos: Suprimento[]
  historico: VinculoAnterior[]
  /** CNPJ/CPF que já apareceram como comprador em notas salvas — a empresa. */
  destinatarios: string[]
}) {
  const router = useRouter()
  const [suprimentos, setSuprimentos] = useState<Suprimento[]>(suprimentosIniciais)
  /** Itens com o cadastro rápido aberto, pelo índice. */
  const [novos, setNovos] = useState<Record<number, NovoSuprimento>>({})
  const [erroNovo, setErroNovo] = useState<Record<number, string>>({})
  const [criando, setCriando] = useState<number | null>(null)
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
  const [cameraAberta, setCameraAberta] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)
  /** Anexar o arquivo já na conferência, sem refazer o formulário. */
  const inputAnexo = useRef<HTMLInputElement>(null)
  const [anexando, setAnexando] = useState(false)
  const [confirmarSemArquivo, setConfirmarSemArquivo] = useState(false)
  /** Nota parecida já lançada: pop-up antes de salvar de novo. */
  const [duplicata, setDuplicata] = useState<DuplicataProvavel | null>(null)

  async function escolher(f: File | undefined, de: 'camera' | 'upload') {
    if (!f) return
    setErro('')
    const comprimido = await comprimir(f)
    setArquivo(comprimido)
    setOrigem(de)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(comprimido.type.startsWith('image/') ? URL.createObjectURL(comprimido) : null)
  }

  function aplicarRascunho(rascunhoNovo: Rascunho) {
    setRascunho(rascunhoNovo)
    setNovos({})
    setErroNovo({})
    const d = rascunhoNovo.documento
    if (d) {
      const porNome = (nome: string | null, lista: { id: string; nome: string }[]) =>
        nome ? lista.find((x) => x.nome.toLowerCase() === nome.toLowerCase().replace(/\s*\(.*\)$/, ''))?.id ?? '' : ''
      setForm({
        tipo: d.tipo,
        fornecedorNome: d.fornecedor_nome ?? '',
        fornecedorDoc: d.fornecedor_doc ?? '',
        destinatarioNome: d.destinatario_nome ?? '',
        destinatarioDoc: d.destinatario_doc ?? '',
        numero: d.numero ?? '',
        serie: d.serie ?? '',
        chaveAcesso: d.chave_acesso ?? '',
        emissao: d.emissao ?? hojeBrasilia(),
        formaPagamento: d.forma_pagamento ?? '',
        // Duplicatas impressas na nota viram as parcelas; sem elas, a condição
        // escolhida gera um vencimento padrão
        condicao: d.condicao_pagamento ?? (d.duplicatas.length ? 'boleto' : ''),
        parcelas:
          d.condicao_pagamento === 'pago' || d.condicao_pagamento === 'debito'
            ? []
            : d.duplicatas.length
              ? d.duplicatas.map((p) => ({ vencimento: p.vencimento, valor: txt(p.valor) }))
              : d.condicao_pagamento && d.total
                ? gerarParcelas(d.total, 1, primeiroVencimentoPadrao(d.condicao_pagamento, d.emissao ?? hoje())).map((p) => ({ vencimento: p.vencimento, valor: txt(p.valor) }))
                : [],
        subtotal: txt(d.subtotal),
        desconto: txt(d.desconto),
        frete: txt(d.frete),
        impostos: txt(d.impostos),
        total: txt(d.total),
        observacoes: d.observacoes ?? '',
        itens: d.itens.length
          ? d.itens.map((i): ItemForm => ({
              descricao: i.descricao,
              codigo: i.codigo ?? '',
              quantidade: txt(i.quantidade) || '1',
              unidade: i.unidade ?? 'un',
              valorUnitario: txt(i.valor_unitario),
              valorTotal: txt(i.valor_total),
              categoriaId: porNome(i.categoria, categorias),
              suprimentoId: porNome(i.suprimento, suprimentos),
              confianca: i.confianca,
              origemVinculo: porNome(i.suprimento, suprimentos) ? 'reconhecido na leitura da nota' : '',
              semSugestao: false,
            })).map((it) => {
              if (it.suprimentoId) return it
              // Sem vínculo da leitura: certeza alta (histórico ou nome inteiro) já vincula
              const sug = sugerirVinculo(it, d.fornecedor_doc ?? '', suprimentos, historico)
              return sug?.certeza === 'alta' ? { ...it, suprimentoId: sug.suprimentoId, origemVinculo: sug.motivo } : it
            })
          : [itemVazio()],
      })
      setConfianca(d.confianca)
    } else {
      setForm(formVazio())
      setConfianca({})
      if (rascunhoNovo.erroLeitura) setErro(rascunhoNovo.erroLeitura + ' O arquivo foi guardado; preencha abaixo ou tente reler com o modelo preciso.')
    }
    setEtapa('conferencia')
  }

  async function enviar(usarIa: boolean) {
    if (!arquivo) return
    setErro('')
    setLendo(true)
    const fd = new FormData()
    fd.set('arquivo', arquivo)
    fd.set('origem', origem)
    fd.set('ia', usarIa ? 'sim' : 'nao')
    fd.set('modelo', 'rapido')
    const r = await lerDespesa(fd)
    setLendo(false)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    aplicarRascunho(r.rascunho)
  }

  /** Nota sem foto/PDF: abre a conferência em branco (a tela lembra de anexar). */
  function semArquivo() {
    setErro('')
    setArquivo(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    aplicarRascunho({ arquivoPath: null, origem: 'upload', modo: 'manual', modelo: null, documento: null, erroLeitura: null })
  }

  /** Guarda o arquivo para uma nota que já está sendo conferida, sem mexer nos campos. */
  async function anexarAgora(f: File | undefined) {
    if (!f) return
    setErro('')
    setAnexando(true)
    const comprimido = await comprimir(f)
    const fd = new FormData()
    fd.set('arquivo', comprimido)
    fd.set('origem', 'upload')
    fd.set('ia', 'nao')
    const r = await lerDespesa(fd)
    setAnexando(false)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    setArquivo(comprimido)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(comprimido.type.startsWith('image/') ? URL.createObjectURL(comprimido) : null)
    setRascunho((atual) => (atual ? { ...atual, arquivoPath: r.rascunho.arquivoPath } : r.rascunho))
    setConfirmarSemArquivo(false)
  }

  async function relerPreciso() {
    if (!rascunho?.arquivoPath) return
    setErro('')
    setLendo(true)
    const r = await relerDespesa(rascunho.arquivoPath, 'preciso')
    setLendo(false)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    aplicarRascunho(r.rascunho)
  }

  const somaItens = form.itens.reduce((s, i) => s + num(i.valorTotal), 0)
  const totalCalculado = somaItens - num(form.desconto) + num(form.frete) + num(form.impostos)
  const totalInformado = num(form.total)
  const diferenca = Math.round((totalInformado - totalCalculado) * 100) / 100

  // Pagamento → contas a pagar
  const aPrazo = !!form.condicao && !quitadaNaCompra(form.condicao)
  const parcelasNum = aPrazo ? form.parcelas.map((p) => ({ vencimento: p.vencimento, valor: num(p.valor) })) : []
  const somaParcelas = Math.round(parcelasNum.reduce((s, p) => s + p.valor, 0) * 100) / 100
  const erroParcelas = aPrazo ? validarParcelas(parcelasNum, totalInformado) : null

  function escolherCondicao(c: Condicao | '') {
    setForm((f) => {
      if (!c || quitadaNaCompra(c)) return { ...f, condicao: c }
      // Primeira vez a prazo: um vencimento padrão com o total
      const parcelas = f.parcelas.length
        ? f.parcelas
        : gerarParcelas(num(f.total), 1, primeiroVencimentoPadrao(c, f.emissao || hoje())).map((p) => ({ vencimento: p.vencimento, valor: txt(p.valor) }))
      return { ...f, condicao: c, parcelas }
    })
  }

  function redistribuir(qtd: number) {
    if (!form.condicao || quitadaNaCompra(form.condicao)) return
    const primeiro = form.parcelas[0]?.vencimento || primeiroVencimentoPadrao(form.condicao, form.emissao || hoje())
    setForm({ ...form, parcelas: gerarParcelas(totalInformado, qtd, primeiro).map((p) => ({ vencimento: p.vencimento, valor: txt(p.valor) })) })
  }

  function setParcela(idx: number, patch: Partial<{ vencimento: string; valor: string }>) {
    setForm((f) => ({ ...f, parcelas: f.parcelas.map((p, j) => (j === idx ? { ...p, ...patch } : p)) }))
  }

  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome

  function removerItem(idx: number) {
    setForm((f) => ({ ...f, itens: f.itens.filter((_, j) => j !== idx) }))
    // Os cadastros abertos são por índice: os de baixo sobem uma posição
    const reindexa = <T,>(m: Record<number, T>) =>
      Object.fromEntries(Object.entries(m).filter(([k]) => Number(k) !== idx).map(([k, v]) => [Number(k) > idx ? Number(k) - 1 : Number(k), v])) as Record<number, T>
    setNovos(reindexa)
    setErroNovo(reindexa)
  }

  function abrirNovo(idx: number) {
    const i = form.itens[idx]
    setNovos((n) => ({
      ...n,
      [idx]: { nome: i.descricao.slice(0, 120), unidade: unidadeDoEstoque(i.unidade), categoriaId: i.categoriaId, consumoPorMetro: '' },
    }))
    setErroNovo((e) => ({ ...e, [idx]: '' }))
  }

  function fecharNovo(idx: number) {
    setNovos((n) => {
      const r = { ...n }
      delete r[idx]
      return r
    })
  }

  async function cadastrarNovo(idx: number) {
    const n = novos[idx]
    if (!n) return
    setCriando(idx)
    setErroNovo((e) => ({ ...e, [idx]: '' }))
    const r = await criarSuprimento({
      nome: n.nome,
      unidade: n.unidade,
      categoriaId: n.categoriaId || null,
      minimo: 0,
      consumoPorMetro: n.consumoPorMetro ? num(n.consumoPorMetro) : null,
    })
    setCriando(null)
    if (!r.ok) {
      setErroNovo((e) => ({ ...e, [idx]: r.erro }))
      return
    }
    const novo = { id: r.id, nome: n.nome.trim(), unidade: n.unidade }
    setSuprimentos((l) => [...l, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    setItem(idx, { suprimentoId: r.id, origemVinculo: '' })
    fecharNovo(idx)
  }

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

  function salvar(semArquivoConfirmado = false, duplicadaConfirmada = false) {
    setErro('')
    if (bloqueio) {
      setErro(bloqueio)
      return
    }
    if (!form.condicao) {
      setErro('Escolha como a nota foi paga (seção Pagamento).')
      return
    }
    if (erroParcelas) {
      setErro(erroParcelas)
      return
    }
    // Sem comprovante é permitido, mas pede confirmação e lembra de anexar
    if (!rascunho?.arquivoPath && !semArquivoConfirmado) {
      setConfirmarSemArquivo(true)
      return
    }
    setConfirmarSemArquivo(false)
    setDuplicata(null)
    const dados: DadosDespesa = {
      arquivoPath: rascunho?.arquivoPath ?? null,
      origem: rascunho?.origem ?? origem,
      modo: rascunho?.modo ?? 'manual',
      modeloIa: rascunho?.modelo ?? null,
      tipo: form.tipo,
      fornecedorNome: form.fornecedorNome || null,
      fornecedorDoc: form.fornecedorDoc || null,
      destinatarioNome: form.destinatarioNome || null,
      destinatarioDoc: form.destinatarioDoc || null,
      numero: form.numero || null,
      serie: form.serie || null,
      chaveAcesso: form.chaveAcesso || null,
      emissao: form.emissao,
      formaPagamento: form.formaPagamento || null,
      condicao: form.condicao as Condicao,
      parcelas: parcelasNum,
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
      leituraIa:
        rascunho?.modo === 'ia' && rascunho.leituraOriginal
          ? { documento: rascunho.leituraOriginal as unknown as Record<string, unknown>, releitura: rascunho.releitura ?? null }
          : null,
      confirmarDuplicada: duplicadaConfirmada,
    }
    iniciar(async () => {
      const r = await salvarDespesa(dados)
      if (!r.ok) {
        if ('duplicata' in r) setDuplicata(r.duplicata)
        else setErro(r.erro)
        return
      }
      router.push('/admin/estoque/despesas')
      router.refresh()
    })
  }

  // Sugestão para itens ainda sem vínculo (recalcula quando a descrição muda)
  const sugestoes = form.itens.map((it) =>
    it.suprimentoId || it.semSugestao ? null : sugerirVinculo(it, form.fornecedorDoc, suprimentos, historico)
  )

  const cls = (chave: string) => campo + ' ' + ((confianca[chave] ?? 1) < LIMIAR ? duvida : normal)

  // Conferências ao vivo — as mesmas que o servidor e o banco fazem ao salvar
  const chaveDigitos = form.chaveAcesso.replace(/\D/g, '')
  const chaveErrada = chaveDigitos.length > 0 && !chaveAcessoValida(chaveDigitos)
  const divergencias = divergenciasDaChave(form, form.chaveAcesso)
  const avisoEmissao = avisoDaEmissao(form.emissao, hoje())
  const destDoc = form.destinatarioDoc.replace(/\D/g, '')
  const outraEmpresa = !!destDoc && destinatarios.length > 0 && !destinatarios.includes(destDoc)
  const bloqueio = chaveErrada
    ? 'A chave de acesso tem dígito errado: confira os 44 números ou apague o campo.'
    : divergencias.length
      ? `Não bate com a chave de acesso: ${divergencias.join('; ')}.`
      : avisoEmissao?.bloqueia
        ? avisoEmissao.texto
        : ''

  /* ------------------------------ etapa 1 ------------------------------ */
  if (etapa === 'captura') {
    return (
      <div>
        <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files?.[0], 'camera')} />
        {cameraAberta && (
          <CameraNota
            onFoto={(f) => {
              setCameraAberta(false)
              escolher(f, 'camera')
            }}
            onFechar={() => setCameraAberta(false)}
            onCameraDoCelular={() => {
              setCameraAberta(false)
              inputCamera.current?.click()
            }}
          />
        )}
        <input ref={inputArquivo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => escolher(e.target.files?.[0], 'upload')} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => setCameraAberta(true)} className="bg-white border-2 border-dashed border-[#131A2E] rounded-sm py-8 text-sm font-semibold tracking-wide hover:bg-[#FAFAF7]">
            📷 TIRAR FOTO
            <span className="block text-xs font-normal text-[#6E6E68] mt-1">abre a câmera com moldura para enquadrar a nota</span>
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
                {lendo ? 'LENDO A NOTA… (até 1 minuto)' : 'LER COM IA E CONFERIR'}
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

        {!arquivo && (
          <button onClick={semArquivo} className="mt-3 text-xs text-[#6E6E68] underline hover:text-[#131A2E]">
            Não tenho a nota agora — lançar sem arquivo
          </button>
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
          <div className="text-xs text-[#0090D8] bg-[#E6EDEE] rounded-sm px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">
              Lida pelo modelo {rascunho.modelo === 'preciso' ? 'preciso' : 'rápido'}. Campos em amarelo tiveram leitura incerta: confira com a imagem ao lado.
            </span>
            {rascunho.modelo !== 'preciso' && (
              <button onClick={relerPreciso} disabled={lendo} className="shrink-0 border border-[#0090D8] rounded-sm px-2.5 py-1 text-[11px] font-semibold tracking-wide disabled:opacity-50">
                {lendo ? 'RELENDO…' : 'RELER COM O MODELO PRECISO'}
              </button>
            )}
          </div>
        )}
        {rascunho?.modo === 'ia' && !!rascunho.releitura?.length && (
          <p className="text-xs text-[#6B5320] bg-[#FFFBEE] border border-[#C79600] rounded-sm px-3 py-2 mb-3">
            A leitura rápida veio com problema ({rascunho.releitura.join('; ')}), então o modelo preciso releu sozinho
            {rascunho.modelo === 'preciso' ? '.' : ', mas não fez melhor — ficou a leitura rápida.'} Confira com atenção.
          </p>
        )}
        {rascunho?.modo === 'ia' && !!rascunho.ajustes?.length && (
          <p className="text-xs text-[#2E7D4F] bg-[#E3F0E8] border border-[#2E7D4F] rounded-sm px-3 py-2 mb-3">
            ✓ Corrigido pela chave de acesso: {rascunho.ajustes.join(', ')}. A chave tem dígito verificador, então ela vale mais que a leitura da imagem.
          </p>
        )}
        {rascunho?.modo === 'manual' && rascunho.arquivoPath && (
          <div className="text-xs text-[#6E6E68] bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">Preenchimento à mão. Se quiser, a IA pode tentar ler este arquivo.</span>
            <button onClick={relerPreciso} disabled={lendo} className="shrink-0 border border-[#131A2E] rounded-sm px-2.5 py-1 text-[11px] font-semibold tracking-wide disabled:opacity-50">
              {lendo ? 'LENDO…' : 'LER COM O MODELO PRECISO'}
            </button>
          </div>
        )}
        <input ref={inputAnexo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => anexarAgora(e.target.files?.[0])} />
        {!rascunho?.arquivoPath && (
          <div className="text-xs text-[#6B5320] bg-[#FFFBEE] border border-[#C79600] rounded-sm px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">Nota sem foto ou PDF. Dá para salvar assim, mas a conta a pagar fica sem comprovante.</span>
            <button onClick={() => inputAnexo.current?.click()} disabled={anexando} className="shrink-0 border border-[#C79600] bg-white rounded-sm px-2.5 py-1 text-[11px] font-semibold tracking-wide disabled:opacity-50">
              {anexando ? 'ANEXANDO…' : '📎 ANEXAR AGORA'}
            </button>
          </div>
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
            <input value={form.chaveAcesso} onChange={(e) => setForm({ ...form, chaveAcesso: e.target.value })} inputMode="numeric" className={campo + ' ' + (chaveErrada || divergencias.length ? duvida : normal) + ' font-mono text-xs'} />
          </label>
          <label className={rotulo + ' col-span-2 sm:col-span-3'}>COMPRADOR (DESTINATÁRIO)
            <input value={form.destinatarioNome} onChange={(e) => setForm({ ...form, destinatarioNome: e.target.value })} className={campo + ' ' + (outraEmpresa ? duvida : normal)} placeholder="quem aparece como comprador na nota" />
          </label>
          <label className={rotulo}>CNPJ / CPF DO COMPRADOR
            <input value={form.destinatarioDoc} onChange={(e) => setForm({ ...form, destinatarioDoc: e.target.value })} inputMode="numeric" className={campo + ' ' + (outraEmpresa ? duvida : normal)} />
          </label>
          {chaveErrada && (
            <p className="col-span-2 sm:col-span-4 text-xs text-[#B00063]">A chave de acesso tem dígito errado: confira os 44 números com o documento, ou apague o campo.</p>
          )}
          {divergencias.length > 0 && (
            <p className="col-span-2 sm:col-span-4 text-xs text-[#B00063]">
              Não bate com a chave de acesso: {divergencias.join('; ')}.{' '}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, ...corrigirPelaChave(f, f.chaveAcesso).campos, tipo: corrigirPelaChave(f, f.chaveAcesso).campos.tipo as Form['tipo'] }))}
                className="underline font-semibold"
              >
                usar o que a chave diz
              </button>{' '}
              (a data só se corrige à mão) ou confira a chave.
            </p>
          )}
          {avisoEmissao && (
            <p className={'col-span-2 sm:col-span-4 text-xs ' + (avisoEmissao.bloqueia ? 'text-[#B00063]' : 'text-[#8A6100]')}>{avisoEmissao.texto}</p>
          )}
          {outraEmpresa && (
            <p className="col-span-2 sm:col-span-4 text-xs text-[#8A6100]">
              O comprador desta nota não é o das notas anteriores. Confira se é mesmo uma compra da empresa (e não uma nota pessoal ou de outra empresa).
            </p>
          )}
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
                  <select
                    value={novos[idx] ? NOVO : i.suprimentoId}
                    onChange={(e) => {
                      if (e.target.value === NOVO) return abrirNovo(idx)
                      fecharNovo(idx)
                      setItem(idx, { suprimentoId: e.target.value, origemVinculo: '' })
                    }}
                    className={campo + ' ' + (!i.suprimentoId && !novos[idx] && ehDeEstoque(nomeCategoria(i.categoriaId)) ? duvida : normal)}
                  >
                    <option value="">— só despesa —</option>
                    {suprimentos.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.unidade})</option>)}
                    <option value={NOVO}>+ cadastrar novo suprimento…</option>
                  </select>
                </label>
                <div className="col-span-6 sm:col-span-1 flex items-end justify-end">
                  <button onClick={() => removerItem(idx)} className="text-xs text-[#B00063] hover:underline" title="remover item">remover</button>
                </div>
                {i.suprimentoId && i.origemVinculo && !novos[idx] && (
                  <p className="col-span-6 sm:col-span-12 text-xs text-[#2E7D4F]">
                    ✓ Vinculado sozinho a <strong>{suprimentos.find((x) => x.id === i.suprimentoId)?.nome}</strong> ({i.origemVinculo}). Confira; se não for, troque na lista.
                  </p>
                )}
                {!i.suprimentoId && !novos[idx] && sugestoes[idx] && (
                  <div className="col-span-6 sm:col-span-12 text-xs bg-[#FFFBEE] border border-[#C79600] rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      Parece ser <strong>{suprimentos.find((x) => x.id === sugestoes[idx]!.suprimentoId)?.nome}</strong>{' '}
                      <span className="text-[#6E6E68]">({sugestoes[idx]!.motivo})</span>
                    </span>
                    <button onClick={() => setItem(idx, { suprimentoId: sugestoes[idx]!.suprimentoId, origemVinculo: '' })} className="font-semibold text-[#131A2E] underline">
                      vincular
                    </button>
                    <button onClick={() => setItem(idx, { semSugestao: true })} className="text-[#6E6E68] hover:underline">
                      não é este
                    </button>
                  </div>
                )}
                {!i.suprimentoId && !novos[idx] && !sugestoes[idx] && ehDeEstoque(nomeCategoria(i.categoriaId)) && (
                  <p className="col-span-6 sm:col-span-12 text-xs text-[#8A6100]">
                    Este item não está ligado a nenhum suprimento. Escolha um da lista para vincular, ou{' '}
                    <button onClick={() => abrirNovo(idx)} className="underline font-semibold">cadastre um novo</button>.
                  </p>
                )}
                {i.suprimentoId && !novos[idx] && (() => {
                  const s = suprimentos.find((x) => x.id === i.suprimentoId)
                  return s && unidadeDoEstoque(i.unidade) !== s.unidade ? (
                    <p className="col-span-6 sm:col-span-12 text-xs text-[#8A6100]">
                      A nota está em {i.unidade || '—'} e o suprimento em {s.unidade}: a quantidade entra no estoque em {s.unidade}. Se for preciso, converta a QTD antes de salvar (ex.: rolos em metros).
                    </p>
                  ) : null
                })()}
                {novos[idx] && (
                  <div className="col-span-6 sm:col-span-12 border border-dashed border-[#131A2E] rounded-sm p-2 mt-1 bg-[#FAFAF7]">
                    <p className="text-[10px] font-mono tracking-wider text-[#131A2E] mb-1.5">NOVO SUPRIMENTO</p>
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                      <label className={rotulo + ' col-span-6 sm:col-span-5'}>NOME
                        <input value={novos[idx].nome} onChange={(e) => setNovos({ ...novos, [idx]: { ...novos[idx], nome: e.target.value } })} className={campo + ' ' + normal} />
                      </label>
                      <label className={rotulo + ' col-span-2 sm:col-span-2'}>UNIDADE
                        <select value={novos[idx].unidade} onChange={(e) => setNovos({ ...novos, [idx]: { ...novos[idx], unidade: e.target.value as Unidade } })} className={campo + ' ' + normal}>
                          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </label>
                      <label className={rotulo + ' col-span-4 sm:col-span-3'}>CATEGORIA
                        <select value={novos[idx].categoriaId} onChange={(e) => setNovos({ ...novos, [idx]: { ...novos[idx], categoriaId: e.target.value } })} className={campo + ' ' + normal}>
                          <option value="">—</option>
                          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </label>
                      <label className={rotulo + ' col-span-6 sm:col-span-2'}>CONSUMO/METRO
                        <input value={novos[idx].consumoPorMetro} onChange={(e) => setNovos({ ...novos, [idx]: { ...novos[idx], consumoPorMetro: e.target.value } })} inputMode="decimal" placeholder="opcional" className={campo + ' ' + normal} />
                      </label>
                    </div>
                    {(() => {
                      const ja = parecidos(novos[idx].nome, suprimentos)
                      return ja.length ? (
                        <p className="text-xs text-[#8A6100] mt-1.5">
                          Já existe parecido:{' '}
                          {ja.map((x, k) => (
                            <span key={x.id}>
                              {k > 0 && ', '}
                              <button
                                onClick={() => {
                                  fecharNovo(idx)
                                  setItem(idx, { suprimentoId: x.id, origemVinculo: '' })
                                }}
                                className="underline font-semibold"
                              >
                                {x.nome}
                              </button>
                            </span>
                          ))}
                          . Clique para vincular a ele em vez de cadastrar outro.
                        </p>
                      ) : null
                    })()}
                    <p className="text-xs text-[#6E6E68] mt-1.5">
                      Papel em metros (m) e tinta em litros (L ou mL) entram na média de custos. Consumo por metro é quanto se gasta por metro estampado, na unidade do suprimento.
                    </p>
                    {erroNovo[idx] && <p className="text-xs text-[#B00063] mt-1">{erroNovo[idx]}</p>}
                    <div className="flex gap-3 mt-2">
                      <button onClick={() => cadastrarNovo(idx)} disabled={criando === idx || novos[idx].nome.trim().length < 2} className={botao + ' bg-[#131A2E] text-white'}>
                        {criando === idx ? 'CADASTRANDO…' : 'CADASTRAR E VINCULAR'}
                      </button>
                      <button onClick={() => fecharNovo(idx)} className="text-xs text-[#6E6E68] hover:underline">cancelar</button>
                    </div>
                  </div>
                )}
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

        <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-5 mb-2 flex items-center gap-2">
          PAGAMENTO <span className="flex-1 h-px bg-[#DDDCD5]" />
        </h2>
        <div className={'bg-white border rounded-sm p-3 ' + (form.condicao ? 'border-[#DDDCD5]' : 'border-[#C79600]')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className={rotulo}>COMO FOI PAGA
              <select value={form.condicao} onChange={(e) => escolherCondicao(e.target.value as Condicao | '')} className={campo + ' ' + (form.condicao ? normal : duvida)}>
                <option value="">— escolher —</option>
                {CONDICOES.map((c) => <option key={c} value={c}>{ROTULO_CONDICAO[c]}</option>)}
              </select>
            </label>
            <label className={rotulo}>O QUE DIZ A NOTA
              <input value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} className={campo + ' ' + normal} placeholder="ex.: PIX, crédito 3x, 28/56 DDL" />
            </label>
          </div>

          {!form.condicao && (
            <p className="text-xs text-[#8A6100] mt-2">Obrigatório: a forma de pagamento gera as contas a pagar no Financeiro.</p>
          )}
          {form.condicao && quitadaNaCompra(form.condicao) && (
            <p className="text-xs text-[#2E7D4F] mt-2">
              Entra em contas a pagar já quitada em {form.emissao ? form.emissao.split('-').reverse().join('/') : 'na emissão'}, no valor total da nota.
            </p>
          )}

          {aPrazo && (
            <div className="mt-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className={rotulo + ' w-24'}>PARCELAS
                  <select value={form.parcelas.length || 1} onChange={(e) => redistribuir(Number(e.target.value))} className={campo + ' ' + normal}>
                    {Array.from({ length: MAX_PARCELAS_CONTA }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => redistribuir(form.parcelas.length || 1)} className="text-xs text-[#0090D8] hover:underline pb-2">
                  dividir o total igualmente, mês a mês a partir da 1ª
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                {form.parcelas.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-[2.5rem_1fr_1fr] gap-1.5 items-end">
                    <span className="font-mono text-xs text-[#6E6E68] pb-2">{idx + 1}/{form.parcelas.length}</span>
                    <label className={rotulo}>VENCIMENTO
                      <input type="date" value={p.vencimento} onChange={(e) => setParcela(idx, { vencimento: e.target.value })} className={campo + ' ' + normal} />
                    </label>
                    <label className={rotulo}>VALOR
                      <input value={p.valor} onChange={(e) => setParcela(idx, { valor: e.target.value })} inputMode="decimal" className={campo + ' ' + normal} />
                    </label>
                  </div>
                ))}
              </div>
              <p className={'text-xs mt-2 ' + (erroParcelas ? 'text-[#B00063]' : 'text-[#2E7D4F]')}>
                Parcelas somam R$ {brl(somaParcelas)}
                {erroParcelas ? ` · ${erroParcelas}` : ' · confere com o total.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <button onClick={() => salvar()} disabled={pendente || totalInformado <= 0 || !!bloqueio} title={bloqueio || undefined} className={botao + ' flex-1 bg-[#131A2E] text-white'}>
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
          <div className="border border-dashed border-[#DDDCD5] rounded-sm p-6 text-center text-xs text-[#6E6E68]">
            {arquivo?.name ?? (rascunho?.arquivoPath ? 'sem prévia' : 'sem arquivo anexado')}
          </div>
        )}
      </aside>

      {confirmarSemArquivo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Salvar sem comprovante">
          <div className="bg-white rounded-sm w-full max-w-md p-5 shadow-xl">
            <p className="font-semibold tracking-tight text-[#131A2E]">Salvar a nota sem foto ou PDF?</p>
            <p className="text-sm text-[#6E6E68] mt-2 leading-relaxed">
              A nota e a conta a pagar vão ficar <strong>sem comprovante</strong>. Se você tem a nota ou o recibo, anexe agora — depois fica mais difícil de encontrar.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button onClick={() => inputAnexo.current?.click()} disabled={anexando || pendente} className={botao + ' flex-1 bg-[#131A2E] text-white'}>
                {anexando ? 'ANEXANDO…' : '📎 ANEXAR O ARQUIVO'}
              </button>
              <button onClick={() => salvar(true)} disabled={anexando || pendente} className={botao + ' flex-1 border border-[#131A2E] bg-white'}>
                {pendente ? 'SALVANDO…' : 'SALVAR SEM ARQUIVO'}
              </button>
            </div>
            <button onClick={() => setConfirmarSemArquivo(false)} className="w-full text-xs text-[#6E6E68] underline mt-3">
              voltar para a nota
            </button>
          </div>
        </div>
      )}

      {duplicata && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Nota parecida já lançada">
          <div className="bg-white rounded-sm w-full max-w-md p-5 shadow-xl">
            <p className="font-semibold tracking-tight text-[#131A2E]">Esta nota parece já ter sido lançada</p>
            <p className="text-sm text-[#6E6E68] mt-2 leading-relaxed">
              Já existe uma nota de <strong>{duplicata.fornecedor}</strong>
              {duplicata.numero ? <> (nº {duplicata.numero})</> : null} emitida em{' '}
              <strong>{duplicata.emissao.split('-').reverse().join('/')}</strong> no valor de <strong>R$ {brl(duplicata.total)}</strong>.
              Lançar de novo duplica a despesa, o estoque e a conta a pagar.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button onClick={() => router.push('/admin/estoque/despesas')} disabled={pendente} className={botao + ' flex-1 bg-[#131A2E] text-white'}>
                NÃO SALVAR — VER AS NOTAS
              </button>
              <button onClick={() => salvar(true, true)} disabled={pendente} className={botao + ' flex-1 border border-[#131A2E] bg-white'}>
                {pendente ? 'SALVANDO…' : 'É OUTRA COMPRA — SALVAR'}
              </button>
            </div>
            <button onClick={() => setDuplicata(null)} className="w-full text-xs text-[#6E6E68] underline mt-3">
              voltar para a nota
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
