'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { excluirDespesa, type ResumoDespesas } from '@/app/actions/despesas'
import { CAIXA, CABECALHO, CORPO, ETIQUETA, NUM, NOME, VAZIO } from '@/components/estilo-lista'
import { baixarCsv, numCsv, paraCsv } from '@/components/baixar-csv'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const dataBr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')

const TIPO: Record<string, string> = { nfe: 'NF-e', nfce: 'NFC-e', nfse: 'NFS-e', cupom: 'cupom', recibo: 'recibo', boleto: 'boleto', outro: 'outro' }

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mt-7 mb-3 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-[#DDDCD5]" />
    </h2>
  )
}

export default function ListaDespesas({ resumo }: { resumo: ResumoDespesas }) {
  const router = useRouter()
  const [aberto, setAberto] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const periodo = `${resumo.de}_a_${resumo.ate}`

  function csvItens() {
    baixarCsv(
      `despesas-${periodo}.csv`,
      paraCsv([
        ['Emissão', 'Tipo', 'Fornecedor', 'Nº', 'Item', 'Qtd', 'Un', 'Valor', 'Categoria', 'Suprimento', 'Total do documento'],
        ...resumo.linhas.flatMap((l) =>
          l.itens.map((i) => [dataBr(l.emissao), TIPO[l.tipo] ?? l.tipo, l.fornecedor ?? '', l.numero ?? '', i.descricao, qtd(i.quantidade), i.unidade ?? '', numCsv(i.valorTotal), i.categoria ?? '', i.suprimento ?? '', numCsv(l.total)])
        ),
      ])
    )
  }

  function csvCategorias() {
    baixarCsv(
      `despesas-por-categoria-${periodo}.csv`,
      paraCsv([['Categoria', 'Itens', 'Total'], ...resumo.porCategoria.map((c) => [c.categoria, c.itens, numCsv(c.total)]), ['Total', '', numCsv(resumo.total)]])
    )
  }

  function excluir(id: string) {
    iniciar(async () => {
      const r = await excluirDespesa(id, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setErro('')
      setExcluindo(null)
      setMotivo('')
      router.refresh()
    })
  }

  if (resumo.linhas.length === 0) {
    return <div className={VAZIO + ' mt-6'} data-busca-vazio>Nenhuma despesa no período.</div>
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={csvItens} className="border border-[#DDDCD5] rounded-sm px-3 py-2 text-xs font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]">CSV · ITEM A ITEM</button>
        <button onClick={csvCategorias} className="border border-[#DDDCD5] rounded-sm px-3 py-2 text-xs font-semibold tracking-wide text-[#6E6E68] hover:border-[#131A2E] hover:text-[#131A2E]">CSV · POR CATEGORIA</button>
      </div>

      <Titulo>POR CATEGORIA</Titulo>
      <div className={CAIXA}>
        <div className={CORPO}>
          {resumo.porCategoria.map((c) => (
            <div key={c.categoria} className="flex items-center gap-3 px-2.5 py-1.5 bg-white">
              <span className="flex-1 min-w-0 text-sm truncate">{c.categoria}</span>
              <span className="w-32 shrink-0">
                <span className="block h-1 bg-[#EEEDE7] rounded-full overflow-hidden">
                  <span className="block h-full bg-[#131A2E]" style={{ width: `${resumo.total > 0 ? Math.round((c.total / resumo.total) * 100) : 0}%` }} />
                </span>
              </span>
              <span className={NUM + ' w-10 shrink-0 text-right text-[#6E6E68]'}>{resumo.total > 0 ? Math.round((c.total / resumo.total) * 100) : 0}%</span>
              <span className={NUM + ' w-28 shrink-0 text-right text-sm font-bold'}>R$ {brl(c.total)}</span>
            </div>
          ))}
        </div>
      </div>

      <Titulo>POR FORNECEDOR</Titulo>
      <div className={CAIXA}>
        <div className={CORPO}>
          {resumo.porFornecedor.map((f) => (
            <div key={f.fornecedor} className="flex items-center gap-3 px-2.5 py-1.5 bg-white">
              <span className="flex-1 min-w-0 text-sm truncate">{f.fornecedor}</span>
              <span className={NUM + ' shrink-0 text-[#6E6E68]'}>{f.documentos} doc.</span>
              <span className={NUM + ' w-28 shrink-0 text-right text-sm font-bold'}>R$ {brl(f.total)}</span>
            </div>
          ))}
        </div>
      </div>

      <Titulo>DOCUMENTOS ({resumo.linhas.length})</Titulo>
      {erro && <p className="text-xs text-[#B00063] mb-2">{erro}</p>}
      <div className={CAIXA} data-busca-grupo>
        <div className={CABECALHO}>
          <span className="w-20 shrink-0">Emissão</span>
          <span className="flex-1 min-w-0">Fornecedor</span>
          <span className="w-16 shrink-0 hidden sm:inline">Tipo</span>
          <span className="w-28 shrink-0 text-right">Total</span>
        </div>
        <div className={CORPO}>
          {resumo.linhas.map((l) => (
            <div key={l.id} data-busca={`${l.fornecedor ?? ''} ${l.numero ?? ''} ${l.itens.map((i) => i.descricao).join(' ')}`} className="bg-white">
              <button onClick={() => setAberto(aberto === l.id ? null : l.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[#FAFAF8]">
                <span className={NUM + ' w-20 shrink-0 text-[#6E6E68]'}>{dataBr(l.emissao)}</span>
                <span className="flex-1 min-w-0">
                  <span className={NOME + ' block'}>{l.fornecedor ?? 'Sem fornecedor'}</span>
                  <span className="text-[11px] text-[#6E6E68] truncate block">
                    {l.numero ? `nº ${l.numero} · ` : ''}{l.itens.length} ite{l.itens.length === 1 ? 'm' : 'ns'}
                    {l.modo === 'ia' && <span className={ETIQUETA + ' ml-1.5 bg-[#E6EDEE] text-[#0090D8]'}>IA</span>}
                  </span>
                </span>
                <span className="w-16 shrink-0 hidden sm:inline text-xs text-[#6E6E68]">{TIPO[l.tipo] ?? l.tipo}</span>
                <span className={NUM + ' w-28 shrink-0 text-right text-sm font-bold'}>R$ {brl(l.total)}</span>
              </button>

              {aberto === l.id && (
                <div className="bg-[#FAFAF7] border-t border-[#EFEEE8] px-3 py-2">
                  <div className="divide-y divide-[#EFEEE8]">
                    {l.itens.map((i, idx) => (
                      <div key={idx} className="flex items-center gap-2 py-1 text-xs">
                        <span className="flex-1 min-w-0 truncate">{i.descricao}</span>
                        <span className={NUM + ' shrink-0 text-[#6E6E68]'}>{qtd(i.quantidade)} {i.unidade ?? ''}</span>
                        <span className="shrink-0 w-28 truncate text-[#6E6E68] hidden sm:inline">{i.categoria ?? '—'}</span>
                        {i.suprimento && <span className={ETIQUETA + ' bg-[#E3F0E8] text-[#2E7D4F]'}>estoque</span>}
                        <span className={NUM + ' w-24 shrink-0 text-right'}>R$ {brl(i.valorTotal)}</span>
                      </div>
                    ))}
                  </div>
                  {l.observacoes && <p className="text-[11px] text-[#6E6E68] mt-2">{l.observacoes}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    {l.arquivoUrl && <a href={l.arquivoUrl} target="_blank" rel="noreferrer" className="text-[#0090D8] hover:underline">ver documento</a>}
                    {excluindo !== l.id ? (
                      <button onClick={() => { setExcluindo(l.id); setErro('') }} className="text-[#B00063] hover:underline">excluir</button>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2 w-full">
                        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="motivo da exclusão (mín. 10 caracteres)" className="flex-1 min-w-[12rem] border border-[#DDDCD5] rounded-sm px-2 py-1 text-xs outline-none focus:border-[#131A2E] bg-white" autoFocus />
                        <button onClick={() => excluir(l.id)} disabled={pendente || motivo.trim().length < 10} className="bg-[#B00063] text-white rounded-sm px-3 py-1 text-xs font-semibold disabled:opacity-40">
                          {pendente ? 'EXCLUINDO…' : 'CONFIRMAR'}
                        </button>
                        <button onClick={() => { setExcluindo(null); setMotivo('') }} className="text-[#6E6E68] hover:underline">cancelar</button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
