'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarPedidoAdmin, buscarCatalogo } from '@/app/actions/pedido-admin'
import { formatarMedidas } from '@/app/admin/catalogo/[clienteId]/card-arte'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Cliente = { id: string; razao_social: string }

type Arte = {
  id: string
  sku: string
  nome: string
  largura: number | null
  altura: number | null
  catalogo: string
  imagemUrl: string | null
}

export default function NovoPedido({ clientes }: { clientes: Cliente[] }) {
  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [artes, setArtes] = useState<Arte[]>([])
  const [qtds, setQtds] = useState<Record<string, number>>({})
  const [notas, setNotas] = useState('')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const nomeCliente =
    clientes.find((c) => c.id === clienteId)?.razao_social ?? ''

  const escolhidas = artes.filter((a) => (qtds[a.id] ?? 0) > 0)
  const unidades = escolhidas.reduce((s, a) => s + (qtds[a.id] ?? 0), 0)

  const filtradas = busca.trim()
    ? artes.filter(
        (a) =>
          a.sku.toLowerCase().includes(busca.toLowerCase()) ||
          a.nome.toLowerCase().includes(busca.toLowerCase())
      )
    : artes

  async function trocarCliente(id: string) {
    setClienteId(id)
    setQtds({})
    setArtes([])
    setErro('')
    if (!id) return

    setCarregando(true)
    const lista = await buscarCatalogo(id)
    setArtes(lista)
    setCarregando(false)
  }

  function fechar() {
    setAberto(false)
    setClienteId('')
    setArtes([])
    setQtds({})
    setNotas('')
    setBusca('')
    setErro('')
  }

  function enviar() {
    if (!clienteId) return setErro('Selecione o cliente.')
    if (escolhidas.length === 0) {
      return setErro('Escolha ao menos uma arte com quantidade.')
    }

    setErro('')
    iniciar(async () => {
      const r = await criarPedidoAdmin({
        clienteId,
        itens: escolhidas.map((a) => ({
          produto_id: a.id,
          quantidade: qtds[a.id],
        })),
        notas: notas.trim() || undefined,
      })

      if (!r.ok) {
        setErro(r.erro)
        return
      }

      fechar()
      router.push(`/admin/pedidos/${r.pedidoId}`)
    })
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="bg-[#131A2E] text-white rounded-sm px-3 py-2 text-xs font-semibold tracking-wide"
      >
        + CRIAR PEDIDO
      </button>
    )
  }

  // Aberto, o formulário sai da linha dos botões e ocupa a largura toda
  return (
    <div className="w-full bg-white border border-[#131A2E] rounded-sm p-5 mt-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold tracking-tight">Novo pedido</h2>
        <button
          onClick={fechar}
          aria-label="Fechar"
          className="text-[#6E6E68] hover:text-[#131A2E] text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <div>
        <label
          htmlFor="np-cliente"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          CLIENTE<span className="text-[#B00063] ml-1">*</span>
        </label>
        <select
          id="np-cliente"
          value={clienteId}
          onChange={(e) => trocarCliente(e.target.value)}
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm"
        >
          <option value="">Selecione o cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razao_social}
            </option>
          ))}
        </select>
      </div>

      {carregando && (
        <p className="text-sm text-[#6E6E68] mt-4">Carregando catálogo...</p>
      )}

      {clienteId && !carregando && artes.length === 0 && (
        <p className="text-sm text-[#6E6E68] mt-4">
          Este cliente não tem artes ativas no catálogo.
        </p>
      )}

      {artes.length > 0 && (
        <>
          <div className="mt-5">
            <label
              htmlFor="np-busca"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              CATÁLOGO DE {nomeCliente.toUpperCase()}
            </label>
            <input
              id="np-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por SKU ou nome"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E]"
            />
          </div>

          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
            {filtradas.map((a) => {
              const q = qtds[a.id] ?? 0
              const medidas = formatarMedidas(a.largura, a.altura)

              return (
                <div
                  key={a.id}
                  className={`border rounded-sm p-3 flex gap-3 items-center ${
                    q > 0 ? 'border-[#131A2E] bg-[#FAFAF8]' : 'border-[#DDDCD5]'
                  }`}
                >
                  {a.imagemUrl ? (
                    <img
                      src={a.imagemUrl}
                      alt={a.nome}
                      className="w-12 h-12 object-cover rounded-sm shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-[#EEEDE7] rounded-sm shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono text-[#131A2E]">
                      {a.sku}
                    </div>
                    <div className="font-semibold tracking-tight text-sm truncate">
                      {a.nome}
                    </div>
                    {medidas && (
                      <div className="text-[10px] text-[#6E6E68] font-mono">
                        {medidas}
                      </div>
                    )}
                  </div>

                  <div className="flex border border-[#DDDCD5] rounded-sm overflow-hidden shrink-0">
                    <button
                      onClick={() =>
                        setQtds((x) => ({
                          ...x,
                          [a.id]: Math.max(0, (x[a.id] ?? 0) - 5),
                        }))
                      }
                      aria-label="Diminuir"
                      className="w-7 h-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={q}
                      onChange={(e) =>
                        setQtds((x) => ({
                          ...x,
                          [a.id]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-14 text-center font-mono text-sm outline-none"
                    />
                    <button
                      onClick={() =>
                        setQtds((x) => ({ ...x, [a.id]: (x[a.id] ?? 0) + 5 }))
                      }
                      aria-label="Aumentar"
                      className="w-7 h-8 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}

            {filtradas.length === 0 && (
              <p className="text-sm text-[#6E6E68] py-4 text-center">
                Nenhuma arte encontrada.
              </p>
            )}
          </div>

          <div className="mt-4">
            <label
              htmlFor="np-notas"
              className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
            >
              NOTAS DO PEDIDO
            </label>
            <textarea
              id="np-notas"
              rows={2}
              maxLength={2000}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ex.: pedido feito por telefone com o Sr. João"
              className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#131A2E] resize-y"
            />
          </div>

          <div className="mt-4 pt-4 border-t-2 border-[#131A2E]">
            <div className="flex justify-between items-baseline text-sm text-[#6E6E68]">
              <span>
                {escolhidas.length}{' '}
                {escolhidas.length === 1 ? 'arte' : 'artes'}
              </span>
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <span className="font-semibold tracking-tight">
                QUANTIDADE TOTAL
              </span>
              <strong className="font-mono text-xl">{unidades} un</strong>
            </div>
            <p className="text-xs text-[#6E6E68] mt-2">
              O valor é definido após finalizar a estampa, pela metragem
              realmente impressa.
            </p>
          </div>
        </>
      )}

      {erro && <p className="text-sm text-[#B00063] mt-3">{erro}</p>}

      <div className="grid grid-cols-2 gap-3 mt-4">
        <button
          onClick={fechar}
          className="border border-[#131A2E] rounded-sm py-2.5 text-sm font-semibold tracking-wide"
        >
          CANCELAR
        </button>
        <button
          onClick={enviar}
          disabled={pendente || escolhidas.length === 0}
          className="bg-[#B00063] text-white rounded-sm py-2.5 text-sm font-semibold tracking-wide disabled:opacity-40"
        >
          {pendente ? 'CRIANDO...' : 'CRIAR PEDIDO'}
        </button>
      </div>
    </div>
  )
}