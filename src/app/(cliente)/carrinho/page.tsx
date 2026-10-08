'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCarrinho } from '@/lib/carrinho/contexto'
import { criarPedido, situacaoAtraso, type BoletoVencido } from '@/app/actions/pedidos'

/**
 * Carrinho do cliente. Desde 07/10/2026 não há escolha de forma de pagamento
 * nem de parcelas aqui: quem decide é a equipe, no Faturar, com o valor real
 * do pedido. O carrinho só confere artes, quantidades e notas.
 */
export default function CarrinhoPage() {
  const {
    itens,
    totalUnidades,
    definir,
    remover,
    limpar,
    notas,
    setNotas,
  } = useCarrinho()

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState<{ numero: number; travado: boolean } | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [vencidos, setVencidos] = useState<BoletoVencido[]>([])
  const [bloqueado, setBloqueado] = useState(false)
  const [prazo, setPrazo] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    situacaoAtraso().then((s) => {
      setVencidos(s.vencidos)
      setBloqueado(s.bloqueado)
      setPrazo(s.prazo)
    })
  }, [])

  // Boleto vencido há mais de 5 dias úteis não impede o envio: o pedido
  // entra, mas não é atendido até a regularização. O aviso fica aqui, antes
  // do botão, com a saída à mão
  const travadoPorAtraso = bloqueado
  const primeiroVencido = vencidos[0]
  const linkCartaoAtraso = vencidos.find((v) => v.linkCartao)?.linkCartao ?? null

  async function enviar() {
    setErro('')
    setEnviando(true)

    const r = await criarPedido({
      itens: itens.map((i) => ({
        produto_id: i.produtoId,
        quantidade: i.quantidade,
      })),
      notas: notas.trim() || undefined,
    })

    if (!r.ok) {
      setErro(r.erro)
      setEnviando(false)
      return
    }

    limpar()
    setSucesso({ numero: r.numero, travado: r.travadoPorAtraso })
    setEnviando(false)
    router.refresh()
  }

  if (sucesso) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E3F0E8] mb-4">
          <span className="text-2xl text-[#2E7D4F]">✓</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#131A2E]">
          Pedido enviado
        </h1>
        <p className="text-sm text-[#6E6E68] mt-2">
          Seu pedido{' '}
          <strong className="font-mono text-[#131A2E]">#{sucesso.numero}</strong>{' '}
          foi registrado.
        </p>
        <p className="text-xs text-[#6E6E68] mt-2 max-w-md mx-auto leading-relaxed">
          A equipe confere as artes e confirma o pedido. Valor e forma de
          pagamento são definidos ao fim da estampa.
        </p>
        {sucesso.travado && (
          <div className="mt-4 max-w-md mx-auto bg-[#FBEAF0] border-l-4 border-[#B00063] rounded-r-sm p-4 text-left">
            <p className="text-sm font-semibold text-[#B00063]">
              Este pedido não será atendido até a regularização dos boletos em atraso.
            </p>
            <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
              Assim que o pagamento for identificado, o pedido segue normalmente.
            </p>
            <Link href="/pedidos/boletos" className="inline-block text-xs text-[#0090D8] hover:underline mt-2">
              ver boletos
            </Link>
          </div>
        )}
        <Link
          href="/pedidos"
          className="inline-block mt-6 bg-[#131A2E] text-white rounded-sm px-6 py-3 text-sm font-semibold tracking-wide"
        >
          ACOMPANHAR PEDIDO
        </Link>
        <p className="mt-4">
          <Link href="/catalogo" className="text-sm text-[#6E6E68] hover:text-[#131A2E]">
            Voltar ao catálogo
          </Link>
        </p>
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#131A2E]">
          Carrinho
        </h1>
        <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center mt-6">
          <p className="text-sm text-[#6E6E68]">Carrinho vazio.</p>
          <Link
            href="/catalogo"
            className="inline-block mt-4 text-sm text-[#D8007A] hover:underline"
          >
            Ir para o catálogo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-[#131A2E]">
        Carrinho
      </h1>
      <p className="text-sm text-[#6E6E68] mt-1.5 mb-7">
        Confira antes de enviar
      </p>

      <div className="space-y-3">
        {itens.map((i) => (
          <div
            key={i.produtoId}
            className="bg-white border border-[#DDDCD5] rounded-sm p-3"
          >
            <div className="flex items-start gap-3">
              {i.imagemUrl ? (
                <img
                  src={i.imagemUrl}
                  alt={i.nome}
                  className="w-14 h-14 object-cover rounded-sm shrink-0"
                />
              ) : (
                <div className="w-14 h-14 bg-[#EEEDE7] rounded-sm shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-[#131A2E]">{i.sku}</div>
                <h2 className="font-semibold tracking-tight mt-0.5 truncate">
                  {i.nome}
                </h2>
              </div>

              <button
                onClick={() => setRemovendo(i.produtoId)}
                aria-label={`Remover ${i.nome}`}
                className="w-7 h-7 shrink-0 border border-[#DDDCD5] rounded-sm text-[#6E6E68] text-xs hover:border-[#D8007A] hover:text-[#D8007A]"
              >
                ✕
              </button>
            </div>

            {removendo === i.produtoId ? (
              <div className="mt-3 border border-[#E8C36B] bg-[#FBF0D9] rounded-sm p-3">
                <p className="text-xs mb-3">
                  Remover <strong>{i.nome}</strong> do pedido?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRemovendo(null)}
                    className="border border-[#131A2E] rounded-sm py-2 text-xs font-semibold"
                  >
                    VOLTAR
                  </button>
                  <button
                    onClick={() => {
                      remover(i.produtoId)
                      setRemovendo(null)
                    }}
                    className="bg-[#C79600] text-white rounded-sm py-2 text-xs font-semibold"
                  >
                    REMOVER
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[#DDDCD5]">
                <div className="flex border border-[#DDDCD5] rounded-sm overflow-hidden w-32">
                  <button
                    onClick={() => definir(i.produtoId, i.quantidade - 1)}
                    aria-label="Diminuir"
                    className="w-9 h-9 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={i.quantidade}
                    onChange={(e) =>
                      definir(i.produtoId, Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="flex-1 w-full text-center font-mono text-sm outline-none min-w-0"
                  />
                  <button
                    onClick={() => definir(i.produtoId, i.quantidade + 1)}
                    aria-label="Aumentar"
                    className="w-9 h-9 bg-[#FAFAF8] text-[#6E6E68] active:bg-[#DDDCD5]"
                  >
                    +
                  </button>
                </div>

                <div className="text-xs text-[#6E6E68] font-mono">
                  {i.quantidade} un
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <label
          htmlFor="notas"
          className="block text-xs tracking-widest text-[#6E6E68] mb-1.5"
        >
          NOTAS DO PEDIDO
        </label>
        <textarea
          id="notas"
          rows={3}
          maxLength={2000}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Prazo, forma de dobra, instruções de entrega"
          className="w-full border border-[#DDDCD5] rounded-sm px-3 py-2.5 bg-white outline-none focus:border-[#131A2E] text-sm resize-y"
        />
      </div>

      <div className="mt-6 border-t-2 border-[#131A2E] pt-4 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="font-semibold tracking-tight">Quantidade total</span>
          <strong className="font-mono text-2xl">{totalUnidades} un</strong>
        </div>
        <p className="text-xs text-[#6E6E68]">
          O valor do pedido será informado após finalizar a estampa, com base na
          metragem realmente impressa. A forma de pagamento é combinada com a
          equipe nesse momento.
        </p>
      </div>

      {erro && (
        <p className="text-sm text-[#D8007A] mt-4 bg-white border border-[#D8007A] rounded-sm p-3">
          {erro}
        </p>
      )}

      {vencidos.length > 0 && (
        <div
          className={`mt-5 rounded-r-sm p-4 border-l-4 ${
            travadoPorAtraso ? 'bg-[#FBEAF0] border-[#B00063]' : 'bg-[#FFFBEE] border-[#C79600]'
          }`}
        >
          <p className={`text-sm font-semibold ${travadoPorAtraso ? 'text-[#B00063]' : 'text-[#6B5320]'}`}>
            {travadoPorAtraso
              ? 'Há boleto em atraso. Você pode enviar o pedido, mas ele não será atendido até a regularização.'
              : 'Há boleto em atraso.'}
          </p>
          <p className="text-xs text-[#6E6E68] mt-1 leading-relaxed">
            {travadoPorAtraso
              ? 'Assim que o pagamento for identificado, o pedido segue normalmente.'
              : prazo
              ? `Regularize até ${new Date(prazo + 'T00:00:00').toLocaleDateString('pt-BR')}: depois de 5 dias úteis do vencimento, os pedidos deixam de ser atendidos até o pagamento.`
              : 'Depois de 5 dias úteis do vencimento, os pedidos deixam de ser atendidos até o pagamento.'}
          </p>
          <div className="flex gap-2 flex-wrap mt-3">
            <a
              href={primeiroVencido?.pdfUrl ?? primeiroVencido?.linkBoleto ?? '/pedidos/boletos'}
              target={primeiroVencido?.pdfUrl || primeiroVencido?.linkBoleto ? '_blank' : undefined}
              rel="noreferrer"
              className="flex-1 text-center bg-[#131A2E] text-white rounded-sm py-2.5 text-xs font-bold tracking-wide"
            >
              PAGAR BOLETO AGORA
            </a>
            {linkCartaoAtraso && (
              <a
                href={linkCartaoAtraso}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center bg-[#D8007A] text-white rounded-sm py-2.5 text-xs font-bold tracking-wide"
              >
                PAGAR COM CARTÃO
              </a>
            )}
          </div>
          {primeiroVencido?.linhaDigitavel && (
            <p className="font-mono text-[11px] text-[#6E6E68] mt-2 break-all select-all">
              {primeiroVencido.linhaDigitavel}
            </p>
          )}
          <Link href="/pedidos/boletos" className="inline-block text-xs text-[#0090D8] hover:underline mt-2">
            ver todos os boletos
          </Link>
        </div>
      )}

      <button
        onClick={enviar}
        disabled={enviando}
        className="w-full mt-5 mb-4 bg-[#D8007A] text-white rounded-sm py-4 text-sm font-bold tracking-wider disabled:opacity-50"
      >
        {enviando ? 'ENVIANDO...' : 'ENVIAR PEDIDO'}
      </button>
    </div>
  )
}