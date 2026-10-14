'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirEnvio, finalizarEnvio } from '@/app/actions/artes'
import { createClient } from '@/lib/supabase/client'

const TAMANHO_MAX_MB = 50

const EMAIL_ARTES = 'bestcolortecidos@gmail.com'

type Envio = {
  id: string
  link: string
  observacoes: string | null
  situacao: string
  resposta: string | null
  criadoEm: string
}

const SITUACOES: Record<string, { rotulo: string; cor: string }> = {
  recebido:   { rotulo: 'Recebido',           cor: 'bg-[#E6EDEE] text-[#0090D8]' },
  em_analise: { rotulo: 'Em análise',         cor: 'bg-[#FBF0D9] text-[#C79600]' },
  cadastrado: { rotulo: 'Cadastrado',         cor: 'bg-[#E3F0E8] text-[#2E7D4F]' },
  rejeitado:  { rotulo: 'Precisa de reenvio', cor: 'bg-[#FFF6FA] text-[#B00063]' },
}

export default function EnvioArtes({ envios }: { envios: Envio[] }) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [link, setLink] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const router = useRouter()

  function escolherArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? [])
    const grande = lista.find((f) => f.size > TAMANHO_MAX_MB * 1024 * 1024)

    if (grande) {
      setErro(
        `"${grande.name}" tem mais de ${TAMANHO_MAX_MB} MB. ` +
          'Envie por link ou reduza o arquivo.'
      )
      return
    }

    setErro('')
    setArquivos(lista)
  }

  async function enviar() {
    if (!link.trim() && arquivos.length === 0) {
      return setErro('Anexe os arquivos ou informe o link.')
    }

    setErro('')
    setEnviando(true)
    setProgresso('')

    try {
      const r = await abrirEnvio({ link: link.trim() || undefined, observacoes })
      if (!r.ok) {
        setEnviando(false)
        return setErro(r.erro)
      }

      // Os arquivos vão direto do navegador para o Storage: a Vercel
      // limita o corpo de requisição a 4,5 MB e não daria conta.
      if (arquivos.length > 0) {
        const supabase = createClient()

        for (let i = 0; i < arquivos.length; i++) {
          const arquivo = arquivos[i]
          setProgresso(`Enviando ${i + 1} de ${arquivos.length}...`)

          const caminho = `${r.clienteId}/${r.envioId}/${arquivo.name}`

          const { error: erroUpload } = await supabase.storage
            .from('envios-arte')
            .upload(caminho, arquivo, { upsert: true })

          if (erroUpload) {
            setEnviando(false)
            setProgresso('')
            return setErro(
              `Falha ao enviar "${arquivo.name}": ${erroUpload.message}`
            )
          }

          const { error: erroRegistro } = await supabase
            .from('envio_arte_arquivos')
            .insert({
              envio_id: r.envioId,
              nome: arquivo.name,
              caminho,
              tamanho_bytes: arquivo.size,
            })

          if (erroRegistro) {
            setEnviando(false)
            setProgresso('')
            return setErro(`Falha ao registrar "${arquivo.name}".`)
          }
        }
      }

      await finalizarEnvio()

      setEnviando(false)
      setProgresso('')
      setSucesso(true)
      setLink('')
      setObservacoes('')
      setArquivos([])
      router.refresh()
    } catch {
      setEnviando(false)
      setProgresso('')
      setErro('Não foi possível concluir o envio. Tente novamente.')
    }
  }

  async function copiarEmail() {
    try {
      await navigator.clipboard.writeText(EMAIL_ARTES)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      // navegador bloqueou; o e-mail continua visível na tela
    }
  }

  return (
    <div className="mt-10">
      <h2 className="text-[10px] tracking-[0.16em] text-[#6E6E68] mb-3 flex items-center gap-2">
        ENVIAR ARTES NOVAS
        <span className="flex-1 h-px bg-[#DDDCD5]" />
      </h2>

      {!aberto ? (
        <button
          onClick={() => setAberto(true)}
          className="w-full sm:w-auto border border-[#131A2E] rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide"
        >
          + ENVIAR ARTES
        </button>
      ) : (
        <div className="bg-white border border-[#DDDCD5] rounded-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold tracking-tight">Envio de artes</h3>
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-[#6E6E68] leading-relaxed mb-3">
            Anexe os arquivos aqui ou, se forem muito grandes, envie o link de
            Google Drive, Dropbox, WeTransfer ou serviço equivalente.
          </p>

          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1.5">
              NOMEIE PELO SKU
            </strong>
            Cada arquivo salvo com o nome igual ao SKU do produto — por exemplo{' '}
            <span className="font-mono">AUR-1042.png</span>. Arquivos fora desse
            padrão voltam para reenvio.
          </div>

          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 text-xs leading-relaxed mt-2">
            <strong className="block text-[10px] tracking-widest mb-1.5">
              SE USAR LINK, LIBERE O ACESSO
            </strong>
            O link precisa permitir download direto, sem pedir autorização. Se o
            serviço exigir liberar por e-mail, use{' '}
            <button
              onClick={copiarEmail}
              className="inline-flex items-center gap-1 font-mono font-semibold bg-white border border-[#C79600] rounded-sm px-1.5 py-0.5 align-baseline"
            >
              {EMAIL_ARTES}
              {copiado && <span className="text-[#2E7D4F]">copiado</span>}
            </button>
            . Links do WeTransfer e afins expiram em poucos dias — avise se o seu
            tiver prazo curto.
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="arquivos"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                ARQUIVOS
              </label>
              <input
                id="arquivos"
                type="file"
                multiple
                onChange={escolherArquivos}
                className="block w-full text-sm text-[#6E6E68] file:mr-3 file:rounded-sm file:border file:border-[#DDDCD5] file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:tracking-wide"
              />
              <p className="text-xs text-[#6E6E68] mt-1">
                Até {TAMANHO_MAX_MB} MB por arquivo. Pode selecionar vários.
              </p>

              {arquivos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {arquivos.map((a) => (
                    <li
                      key={a.name}
                      className="flex items-center justify-between gap-2 text-xs bg-[#FAFAF7] border border-[#DDDCD5] rounded-sm px-2.5 py-1.5"
                    >
                      <span className="truncate font-mono">{a.name}</span>
                      <span className="text-[#6E6E68] shrink-0">
                        {(a.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label
                htmlFor="link"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                LINK DOS ARQUIVOS{' '}
                <span className="text-[#DDDCD5]">
                  {arquivos.length > 0 ? 'opcional' : 'ou anexe acima'}
                </span>
              </label>
              <input
                id="link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="https://we.tl/... ou https://drive.google.com/..."
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E]"
              />
            </div>

            <div>
              <label
                htmlFor="observacoes"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                OBSERVAÇÕES <span className="text-[#DDDCD5]">opcional</span>
              </label>
              <textarea
                id="observacoes"
                rows={2}
                maxLength={1000}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Quantas artes, tecido pretendido, prazo do link, instruções"
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
              />
            </div>

            {progresso && (
              <p className="text-sm text-[#6E6E68]">{progresso}</p>
            )}

            {erro && <p className="text-sm text-[#B00063]">{erro}</p>}

            {sucesso && (
              <p className="text-sm text-[#2E7D4F]">
                Envio recebido. A equipe da US Decor foi notificada.
              </p>
            )}

            <button
              onClick={enviar}
              disabled={enviando}
              className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {enviando ? 'ENVIANDO...' : 'ENVIAR'}
            </button>
          </div>
        </div>
      )}

      {envios.length > 0 && (
        <div className="mt-5 space-y-2">
          {envios.map((e) => {
            const s = SITUACOES[e.situacao] ?? SITUACOES.recebido
            return (
              <div
                key={e.id}
                className="bg-white border border-[#DDDCD5] rounded-sm p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-[#6E6E68]">
                    {new Date(e.criadoEm).toLocaleDateString('pt-BR')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-sm ${s.cor}`}>
                    {s.rotulo}
                  </span>
                </div>
                <p className="text-xs font-mono text-[#0090D8] mt-1.5 break-all">
                  {e.link}
                </p>
                {e.observacoes && (
                  <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
                    {e.observacoes}
                  </p>
                )}
                {e.resposta && (
                  <p className="text-xs mt-2 pt-2 border-t border-[#DDDCD5] leading-relaxed">
                    <strong>US Decor:</strong> {e.resposta}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}