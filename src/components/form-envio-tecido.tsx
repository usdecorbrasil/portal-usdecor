'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarEnvioTecido } from '@/app/actions/envio-tecido'

/**
 * Aviso de envio de tecido. O mesmo formulário serve ao cliente (sem escolher
 * cliente) e à equipe (escolhe por quem está registrando). A NF de remessa é
 * opcional aqui — pode ser anexada depois, enquanto o envio não for conferido.
 */
export default function FormEnvioTecido({
  tecidos,
  clientes,
  clienteInicial,
}: {
  tecidos: { id: string; nome: string }[]
  /** Só para a equipe: lista para escolher o cliente. */
  clientes?: { id: string; nome: string }[]
  clienteInicial?: string
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')
  const [pendente, iniciar] = useTransition()

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro('')
    setFeito('')
    const dados = new FormData(e.currentTarget)
    iniciar(async () => {
      const r = await registrarEnvioTecido(dados)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      form.current?.reset()
      setFeito(
        clientes
          ? 'Envio registrado. Confira a metragem quando o tecido chegar.'
          : 'Envio registrado. Avisamos a equipe; o saldo entra depois da conferência.'
      )
      router.refresh()
    })
  }

  if (tecidos.length === 0) {
    return (
      <p className="text-xs text-[#8A6A00] bg-[#FFFBEE] border border-[#E8D9A8] rounded-sm px-4 py-3">
        Nenhum tecido cadastrado ainda. {clientes ? 'Cadastre um tecido no fim da página.' : 'Fale com a equipe.'}
      </p>
    )
  }

  if (!aberto) {
    return (
      <div>
        <button
          onClick={() => setAberto(true)}
          className="border border-[#131A2E] rounded-sm px-4 py-2.5 text-xs font-semibold tracking-wide"
        >
          + AVISAR ENVIO DE TECIDO
        </button>
        {feito && <p className="text-xs text-[#2E7D4F] mt-2">{feito}</p>}
      </div>
    )
  }

  const campo = 'w-full border border-[#DDDCD5] rounded-sm px-3 py-2 bg-white text-sm outline-none focus:border-[#131A2E]'
  const rotulo = 'block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1'

  return (
    <form ref={form} onSubmit={enviar} className="bg-white border border-[#DDDCD5] rounded-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9B9A93]">Envio de tecido</p>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[#6E6E68] hover:text-[#131A2E]">
          fechar
        </button>
      </div>

      <p className="text-xs text-[#6E6E68] leading-relaxed mb-3">
        Informe o que foi enviado. O saldo em estoque só muda depois que a
        equipe conferir a metragem na chegada.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {clientes && (
          <div>
            <label htmlFor="envio-cliente" className={rotulo}>CLIENTE</label>
            <select id="envio-cliente" name="clienteId" defaultValue={clienteInicial ?? ''} className={campo} required>
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="envio-tecido" className={rotulo}>TECIDO</label>
          <select id="envio-tecido" name="tecidoId" defaultValue="" className={campo} required>
            <option value="">—</option>
            {tecidos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="envio-metros" className={rotulo}>METROS ENVIADOS</label>
          <input id="envio-metros" name="metros" type="text" inputMode="decimal" placeholder="120,50" required className={campo + ' font-mono'} />
        </div>
        <div>
          <label htmlFor="envio-nf-numero" className={rotulo}>Nº DA NF DE REMESSA (OPCIONAL)</label>
          <input id="envio-nf-numero" name="nfNumero" type="text" maxLength={40} placeholder="Ex.: 12345" className={campo + ' font-mono'} />
        </div>
        <div>
          <label htmlFor="envio-nf" className={rotulo}>ARQUIVO DA NF (XML, PDF, JPG OU PNG, ATÉ 4 MB)</label>
          <input id="envio-nf" name="nf" type="file" accept=".xml,text/xml,application/xml,application/pdf,image/jpeg,image/png" className="block w-full text-xs text-[#6E6E68] file:mr-3 file:border file:border-[#DDDCD5] file:rounded-sm file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
          <p className="text-[11px] text-[#2E7D4F] mt-1">Prefira o <strong>XML da nota</strong> (o arquivo que chega junto da NF-e por e-mail): é lido na hora, sem erro de leitura. PDF ou foto também servem.</p>
          <p className="text-[11px] text-[#9B9A93] mt-1">Pode anexar depois, enquanto o envio não for conferido.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="envio-obs" className={rotulo}>OBSERVAÇÃO (OPCIONAL)</label>
          <input id="envio-obs" name="observacao" type="text" maxLength={500} placeholder="Ex.: 3 rolos, transportadora X, previsão de chegada quinta" className={campo} />
        </div>
      </div>

      {erro && <p className="text-xs text-[#B00063] mt-3">{erro}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="mt-3 bg-[#131A2E] text-white rounded-sm px-4 py-2.5 text-xs font-bold tracking-wide disabled:opacity-50"
      >
        {pendente ? 'REGISTRANDO…' : 'REGISTRAR ENVIO'}
      </button>
    </form>
  )
}
