'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { criarProduto } from '@/app/actions/produtos'
import { reduzirImagem } from '@/lib/imagem/reduzir'

type Colecao = { id: string; nome: string }

export default function FormularioProduto({
  clienteId,
  catalogoId,
  colecoes,
}: {
  clienteId: string
  catalogoId: string
  colecoes: Colecao[]
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(criarProduto, null)
  const form = useRef<HTMLFormElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [reduzida, setReduzida] = useState<Blob | null>(null)
  const [info, setInfo] = useState('')
  const [erroImg, setErroImg] = useState('')
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    if (estado?.ok) {
      form.current?.reset()
      limparImagem()
    }
  }, [estado])

  function limparImagem() {
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
    setReduzida(null)
    setInfo('')
    setErroImg('')
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    limparImagem()
    setProcessando(true)

    const original = Math.round(file.size / 1024)
    const r = await reduzirImagem(file)

    setProcessando(false)

    if (!r.ok) {
      setErroImg(r.erro)
      return
    }

    setReduzida(r.arquivo)
    setPreview(URL.createObjectURL(r.arquivo))
    setInfo(
      original > 1024
        ? `${(original / 1024).toFixed(1)} MB → ${r.kb} KB · ${r.largura}×${r.altura}px`
        : `${original} KB → ${r.kb} KB · ${r.largura}×${r.altura}px`
    )
  }

  function aoEnviar(dados: FormData) {
    if (reduzida) {
      dados.set('imagem', reduzida, 'arte.webp')
    } else {
      dados.delete('imagem')
    }
    return acao(dados)
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="w-full sm:w-auto bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide"
      >
        + CADASTRAR NOVA ARTE
      </button>
    )
  }

  return (
    <div className="bg-white border border-[#DDDCD5] rounded-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold tracking-tight">Nova arte</h2>
        <button
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <form ref={form} action={aoEnviar} className="space-y-4">
        <input type="hidden" name="cliente_id" value={clienteId} />

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo
            nome="sku"
            rotulo="SKU"
            obrigatorio
            placeholder="AUR-1042"
            dica="O arquivo da arte deve ter este mesmo nome"
          />
          <Campo nome="nome" rotulo="NOME DO DESENHO" obrigatorio placeholder="Floral Noturno" />
        </div>

        <div>
          <label
            htmlFor="nv-colecao"
            className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
          >
            COLEÇÃO<span className="text-[#B00063] ml-1">*</span>
          </label>
          <select
            id="nv-colecao"
            name="catalogo_id"
            required
            defaultValue={catalogoId}
            className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
          >
            {colecoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <Campo
          nome="metros_por_unidade"
          rotulo="METROS POR UNIDADE"
          obrigatorio
          placeholder="1,40"
          dica="Comprimento de cada repetição da estampa"
        />

        <div>
          <label
            htmlFor="imagem"
            className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
          >
            IMAGEM DA ARTE<span className="text-[#B00063] ml-1">*</span>
          </label>

          <div className="flex items-start gap-4">
            {preview && (
              <img
                src={preview}
                alt=""
                className="w-24 h-24 object-cover rounded-sm border border-[#DDDCD5] shrink-0"
              />
            )}

            <div className="flex-1 min-w-0">
              <input
                id="imagem"
                name="imagem"
                type="file"
                accept="image/*"
                onChange={aoEscolher}
                className="block w-full text-sm text-[#6E6E68] file:mr-3 file:rounded-sm file:border file:border-[#DDDCD5] file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:tracking-wide"
              />

              {processando && (
                <p className="text-xs text-[#6E6E68] mt-2">Reduzindo imagem...</p>
              )}
              {info && (
                <p className="text-xs text-[#2E7D4F] mt-2 font-mono">{info}</p>
              )}
              {erroImg && (
                <p className="text-xs text-[#B00063] mt-2">{erroImg}</p>
              )}

              <p className="text-xs text-[#6E6E68] mt-2 leading-relaxed">
                Pode selecionar o arquivo original em alta. O portal reduz para
                miniatura antes de enviar — o arquivo grande não sai da sua máquina.
              </p>
            </div>
          </div>
        </div>

        {estado && !estado.ok && (
          <p className="text-sm text-[#B00063]">{estado.erro}</p>
        )}

        {estado?.ok && (
          <p className="text-sm text-[#2E7D4F]">
            Arte cadastrada. Ela nasce inativa — ative quando conferir a imagem.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pendente || processando || !reduzida}
            className="bg-[#131A2E] text-white rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide disabled:opacity-50"
          >
            {pendente ? 'CADASTRANDO...' : 'CADASTRAR ARTE'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="border border-[#DDDCD5] rounded-sm px-5 py-2.5 text-sm font-semibold tracking-wide text-[#6E6E68]"
          >
            FECHAR
          </button>
        </div>
      </form>
    </div>
  )
}

function Campo({
  nome,
  rotulo,
  obrigatorio = false,
  placeholder,
  dica,
}: {
  nome: string
  rotulo: string
  obrigatorio?: boolean
  placeholder?: string
  dica?: string
}) {
  return (
    <div>
      <label
        htmlFor={nome}
        className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
      >
        {rotulo}
        {obrigatorio && <span className="text-[#B00063] ml-1">*</span>}
      </label>
      <input
        id={nome}
        name={nome}
        required={obrigatorio}
        placeholder={placeholder}
        className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
      />
      {dica && <p className="text-xs text-[#6E6E68] mt-1">{dica}</p>}
    </div>
  )
}