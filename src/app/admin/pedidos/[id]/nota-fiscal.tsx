'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirEmissaoNf } from '@/app/actions/producao'

/**
 * Escolha de emitir ou não a nota fiscal do pedido.
 *
 * Fica junto da forma de pagamento porque é a mesma conversa comercial, e
 * precisa estar decidida antes de "Pedido pronto" — é a etapa que cria o
 * pedido de venda no Bling, de onde sai o faturamento.
 *
 * Dispensar a nota exige motivo; emitir não. Emitir é o caminho normal, e
 * cobrar justificativa para o normal seria atrito sem propósito.
 */
export default function NotaFiscal({
  pedidoId,
  emitirNf,
  motivo,
  editavel,
}: {
  pedidoId: string
  emitirNf: boolean
  motivo: string | null
  editavel: boolean
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-4 mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold tracking-tight text-sm">Nota fiscal</h2>

        <span className="flex items-baseline gap-3">
          <span
            className={
              'text-[10px] font-mono uppercase tracking-wider rounded-sm px-1.5 py-0.5 ' +
              (emitirNf
                ? 'bg-[#EAE9E3] text-[#6E6E68]'
                : 'bg-[#FBF0D9] text-[#8A6A00]')
            }
          >
            {emitirNf ? 'com nota' : 'sem nota'}
          </span>

          {editavel && (
            <button
              onClick={() => setAberto(true)}
              className="text-xs text-[#0090D8] hover:underline"
            >
              alterar
            </button>
          )}
        </span>
      </div>

      {!emitirNf && motivo && (
        <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed italic">
          &ldquo;{motivo}&rdquo;
        </p>
      )}

      {!editavel && (
        <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
          Nota já emitida — a decisão não muda mais.
        </p>
      )}

      {aberto && (
        <ModalNotaFiscal
          pedidoId={pedidoId}
          emitirNf={emitirNf}
          motivoAtual={motivo}
          aoFechar={() => setAberto(false)}
        />
      )}
    </div>
  )
}

function ModalNotaFiscal({
  pedidoId,
  emitirNf,
  motivoAtual,
  aoFechar,
}: {
  pedidoId: string
  emitirNf: boolean
  motivoAtual: string | null
  aoFechar: () => void
}) {
  const [emitir, setEmitir] = useState(emitirNf)
  const [motivo, setMotivo] = useState(motivoAtual ?? '')
  const [erro, setErro] = useState('')
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pendente) aoFechar()
    }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aoFechar, pendente])

  function salvar() {
    setErro('')

    if (!emitir && motivo.trim().length < 10) {
      return setErro('Descreva o motivo com pelo menos 10 caracteres')
    }

    const mudou =
      emitir !== emitirNf ||
      (!emitir && motivo.trim() !== (motivoAtual ?? '').trim())

    if (!mudou) {
      aoFechar()
      return
    }

    iniciar(async () => {
      const r = await definirEmissaoNf(pedidoId, emitir, motivo.trim())
      if (!r.ok) return setErro(r.erro)
      aoFechar()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#131A2E]/70"
        onClick={() => !pendente && aoFechar()}
      />

      <div className="relative bg-white rounded-sm w-full max-w-sm p-5">
        <h2 className="font-semibold tracking-tight text-lg">
          Este pedido tem nota fiscal?
        </h2>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Opcao
            rotulo="COM NOTA"
            ativo={emitir}
            onClick={() => setEmitir(true)}
          />
          <Opcao
            rotulo="SEM NOTA"
            ativo={!emitir}
            onClick={() => setEmitir(false)}
          />
        </div>

        {/* O motivo só aparece na exceção: fica no pedido e é o que explica a
            venda sem nota para quem olhar depois */}
        {!emitir && (
          <div className="mt-4">
            <label
              htmlFor="nf-motivo"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              MOTIVO <span className="text-[#B00063]">*</span>
            </label>
            <textarea
              id="nf-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ex.: cliente pediu sem nota, combinado com a direção"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
            />
          </div>
        )}

        <p className="text-xs text-[#6E6E68] mt-3 leading-relaxed">
          A decisão vale até o pedido ficar pronto, que é quando ele vai para o
          Bling. Depois da nota emitida ela não muda mais.
        </p>

        {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button
            onClick={aoFechar}
            disabled={pendente}
            className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            CANCELAR
          </button>
          <button
            onClick={salvar}
            disabled={pendente}
            className="bg-[#131A2E] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'SALVANDO...' : 'SALVAR'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Opcao({
  rotulo,
  ativo,
  onClick,
}: {
  rotulo: string
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={
        'rounded-sm py-2.5 text-xs font-semibold tracking-wide border ' +
        (ativo
          ? 'bg-[#131A2E] text-white border-[#131A2E]'
          : 'bg-white text-[#6E6E68] border-[#DDDCD5] hover:border-[#131A2E]')
      }
    >
      {rotulo}
    </button>
  )
}
