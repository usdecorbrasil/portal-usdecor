'use client'

import { useActionState, useState } from 'react'
import { enviarArtes } from '@/app/actions/artes'

const EMAIL_BELLO = 'bellotecido@gmail.com'

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
  const [estado, acao, pendente] = useActionState(enviarArtes, null)
  const [copiado, setCopiado] = useState(false)

  async function copiarEmail() {
    try {
      await navigator.clipboard.writeText(EMAIL_BELLO)
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
          + ENVIAR LINK DE ARTES
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
            Envie o link dos arquivos por Google Drive, Dropbox, WeTransfer,
            OneDrive ou serviço equivalente. Não é preciso subir os arquivos aqui.
          </p>

          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 text-xs leading-relaxed">
            <strong className="block text-[10px] tracking-widest mb-1.5">
              1 · LIBERE O ACESSO
            </strong>
            O link precisa permitir download direto, sem pedir autorização. Se o
            serviço exigir liberar por e-mail, use{' '}
            <button
              onClick={copiarEmail}
              className="inline-flex items-center gap-1 font-mono font-semibold bg-white border border-[#C79600] rounded-sm px-1.5 py-0.5 align-baseline"
            >
              {EMAIL_BELLO}
              {copiado && <span className="text-[#2E7D4F]">copiado</span>}
            </button>
          </div>

          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 text-xs leading-relaxed mt-2">
            <strong className="block text-[10px] tracking-widest mb-1.5">
              2 · NOMEIE PELO SKU
            </strong>
            Cada arquivo salvo com o nome igual ao SKU do produto — por exemplo{' '}
            <span className="font-mono">AUR-1042.png</span>. Arquivos fora desse
            padrão voltam para reenvio.
          </div>

          <div className="bg-[#FBF0D9] border-l-4 border-[#C79600] rounded-r-sm p-3 text-xs leading-relaxed mt-2">
            <strong className="block text-[10px] tracking-widest mb-1.5">
              3 · ATENÇÃO AO PRAZO
            </strong>
            Links de serviços temporários, como o WeTransfer, expiram em poucos
            dias. Avise se o seu tiver prazo curto.
          </div>

          <form action={acao} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="link"
                className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
              >
                LINK DOS ARQUIVOS<span className="text-[#B00063] ml-1">*</span>
              </label>
              <input
                id="link"
                name="link"
                type="url"
                required
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
                name="observacoes"
                rows={2}
                maxLength={1000}
                placeholder="Quantas artes, tecido pretendido, prazo do link, instruções"
                className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
              />
            </div>

            {estado && !estado.ok && (
              <p className="text-sm text-[#B00063]">{estado.erro}</p>
            )}

            {estado?.ok && (
              <p className="text-sm text-[#2E7D4F]">
                Link enviado. A equipe da Bello Tecido foi notificada.
              </p>
            )}

            <button
              type="submit"
              disabled={pendente}
              className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            >
              {pendente ? 'ENVIANDO...' : 'ENVIAR LINK'}
            </button>
          </form>
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
                    <strong>Bello Tecido:</strong> {e.resposta}
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