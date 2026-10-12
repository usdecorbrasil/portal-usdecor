'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importarExtrato } from '@/app/actions/conciliacao'

const campo = 'border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-sm bg-white w-full outline-none focus:border-[#131A2E]'
const rotulo = 'block text-[10px] font-mono tracking-wider text-[#6E6E68]'

export default function ImportarExtrato({ cartoes, ia }: { cartoes: { id: string; nome: string }[]; ia: boolean }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<'banco' | 'cartao'>('banco')
  const [cartaoId, setCartaoId] = useState(cartoes[0]?.id ?? '')
  const [origem, setOrigem] = useState('')
  const [modelo, setModelo] = useState<'rapido' | 'preciso'>('rapido')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  function enviar(f: File | undefined) {
    if (!f) return
    setErro('')
    const fd = new FormData()
    fd.set('arquivo', f)
    fd.set('tipo', tipo)
    fd.set('cartaoId', tipo === 'cartao' ? cartaoId : '')
    fd.set('origem', origem)
    fd.set('modelo', modelo)
    iniciar(async () => {
      const r = await importarExtrato(fd)
      if (!r.ok) return setErro(r.erro)
      router.push(`/admin/financeiro/conciliacao/${r.id}`)
    })
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <label className={rotulo}>O QUE É
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'banco' | 'cartao')} className={campo}>
            <option value="banco">Extrato bancário</option>
            <option value="cartao">Fatura de cartão</option>
          </select>
        </label>
        {tipo === 'cartao' ? (
          <label className={rotulo}>QUAL CARTÃO
            <select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)} className={campo}>
              {cartoes.length === 0 && <option value="">— cadastre em Configurações —</option>}
              {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        ) : (
          <label className={rotulo}>BANCO (opcional)
            <input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="ex.: Itaú" className={campo} />
          </label>
        )}
        <label className={rotulo}>LEITURA (PDF/IMAGEM/CSV)
          <select value={modelo} onChange={(e) => setModelo(e.target.value as 'rapido' | 'preciso')} className={campo} disabled={!ia}>
            <option value="rapido">modelo rápido</option>
            <option value="preciso">modelo preciso</option>
          </select>
        </label>
        <input ref={input} type="file" accept=".ofx,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" disabled={pendente || (tipo === 'cartao' && !cartaoId)} onClick={() => input.current?.click()} className="rounded-sm px-4 py-2 text-xs font-bold tracking-wide bg-[#131A2E] text-white disabled:opacity-50">
          {pendente ? 'IMPORTANDO… (até 2 min)' : '📥 IMPORTAR EXTRATO'}
        </button>
      </div>
      <p className="text-[11px] text-[#6E6E68] mt-2">
        OFX (exportado do banco) é lido na hora, sem IA, com os dados exatos. PDF, foto ou CSV passam pela leitura por IA{ia ? '' : ' — desligada: falta a chave em Configurações → Integrações'}.
      </p>
      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}
    </div>
  )
}
