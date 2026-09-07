'use client'

import { useState, useTransition } from 'react'
import { atualizarEnvio, linksDownload } from '@/app/actions/artes'

export type ArquivoEnvio = {
  nome: string
  tamanhoBytes: number
}

type Envio = {
  id: string
  cliente: string
  link: string | null
  observacoes: string | null
  situacao: string
  criadoEm: string
  arquivos: ArquivoEnvio[]
}

export default function EnviosPendentes({ envios }: { envios: Envio[] }) {
  if (envios.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-2.5 flex items-center gap-2">
        ARTES RECEBIDAS
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>
      <div className="space-y-2">
        {envios.map((item) => (
          <CardEnvio key={item.id} envio={item} />
        ))}
      </div>
    </div>
  )
}

function CardEnvio({ envio }: { envio: Envio }) {
  const [pedindoReenvio, setPedindoReenvio] = useState(false)
  const [resposta, setResposta] = useState('')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()

  const emAnalise = envio.situacao === 'em_analise'

  const classeCard = emAnalise
    ? 'bg-white border border-[#E8C36B] rounded-sm p-4'
    : 'bg-white border border-[#0090D8] rounded-sm p-4'

  const classeTag = emAnalise
    ? 'text-xs px-2 py-0.5 rounded-sm whitespace-nowrap bg-[#FBF0D9] text-[#C79600]'
    : 'text-xs px-2 py-0.5 rounded-sm whitespace-nowrap bg-[#E6EDEE] text-[#0090D8]'

  const classeLink =
    'block text-xs font-mono text-[#0090D8] mt-2 break-all hover:underline'

  function marcar(situacao: 'em_analise' | 'cadastrado' | 'rejeitado') {
    setErro('')
    iniciar(async () => {
      const texto = situacao === 'rejeitado' ? resposta.trim() : undefined
      const r = await atualizarEnvio(envio.id, situacao, texto)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setPedindoReenvio(false)
    })
  }

  /**
   * Baixa os anexos e marca como cadastrado numa ação só — separar os dois
   * passos abriria espaço para cadastrar sem ter baixado.
   */
  function baixarECadastrar() {
    setErro('')
    iniciar(async () => {
      if (envio.arquivos.length > 0) {
        const links = await linksDownload(envio.id)

        if (links.length === 0) {
          setErro('Não foi possível gerar os links de download.')
          return
        }

        // Um clique por arquivo; o navegador pede permissão uma vez
        // quando há vários
        links.forEach((l, i) => {
          setTimeout(() => {
            const a = document.createElement('a')
            a.href = l.url
            a.download = l.nome
            document.body.appendChild(a)
            a.click()
            a.remove()
          }, i * 700)
        })
      }

      const r = await atualizarEnvio(envio.id, 'cadastrado')
      if (!r.ok) setErro(r.erro)
    })
  }

  return (
    <div className={classeCard}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold tracking-tight text-sm">
          {envio.cliente}
        </span>
        <span className={classeTag}>
          {emAnalise ? 'Em análise' : 'Recebido'}
        </span>
      </div>

      <p className="text-[10px] font-mono text-[#6E6E68] mt-1 uppercase tracking-wider">
        {new Date(envio.criadoEm).toLocaleDateString('pt-BR')}
      </p>

      {envio.link && (
        <a href={envio.link} target="_blank" rel="noreferrer" className={classeLink}>
          {envio.link}
        </a>
      )}

      {envio.arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {envio.arquivos.map((a) => (
            <li
              key={a.nome}
              className="flex items-center justify-between gap-2 text-xs bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
            >
              <span className="truncate font-mono">{a.nome}</span>
              <span className="text-[#6E6E68] shrink-0">
                {(a.tamanhoBytes / 1024 / 1024).toFixed(1)} MB
              </span>
            </li>
          ))}
        </ul>
      )}

      {envio.observacoes && (
        <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
          {envio.observacoes}
        </p>
      )}

      {erro && <p className="text-xs text-[#B00063] mt-2">{erro}</p>}

      {pedindoReenvio ? (
        <div className="mt-3 border border-[#B00063] rounded-sm p-3">
          <label
            htmlFor={'resp-' + envio.id}
            className="block text-[9px] font-mono tracking-[0.14em] text-[#6E6E68] mb-1"
          >
            O QUE O CLIENTE PRECISA CORRIGIR
          </label>
          <textarea
            id={'resp-' + envio.id}
            rows={2}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="Ex.: arquivos sem o nome do SKU"
            className="w-full border border-[#DDDCD5] rounded-sm px-2 py-1.5 text-xs outline-none focus:border-[#131A2E] resize-y"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => setPedindoReenvio(false)}
              disabled={pendente}
              className="border border-[#DDDCD5] rounded-sm py-1.5 text-[10px] font-semibold tracking-wider text-[#6E6E68] disabled:opacity-50"
            >
              VOLTAR
            </button>
            <button
              onClick={() => marcar('rejeitado')}
              disabled={pendente}
              className="bg-[#B00063] text-white rounded-sm py-1.5 text-[10px] font-semibold tracking-wider disabled:opacity-50"
            >
              {pendente ? '...' : 'PEDIR REENVIO'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            onClick={() => marcar('em_analise')}
            disabled={pendente || emAnalise}
            className="border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#C79600] hover:text-[#C79600] disabled:opacity-40"
          >
            BAIXANDO
          </button>
          <button
            onClick={() => setPedindoReenvio(true)}
            disabled={pendente}
            className="border border-[#DDDCD5] rounded-sm py-2 text-[10px] font-semibold tracking-wider text-[#6E6E68] hover:border-[#B00063] hover:text-[#B00063] disabled:opacity-50"
          >
            REENVIAR
          </button>
          <button
            onClick={baixarECadastrar}
            disabled={pendente}
            className="bg-[#2E7D4F] text-white rounded-sm py-2 text-[10px] font-semibold tracking-wider disabled:opacity-50"
          >
            {pendente
              ? '...'
              : envio.arquivos.length > 0
              ? 'BAIXAR E CADASTRAR'
              : 'CADASTRADO'}
          </button>
        </div>
      )}
    </div>
  )
}