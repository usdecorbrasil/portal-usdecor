'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * O carrinho não carrega valores: o preço do pedido só é definido quando a
 * metragem real é informada no romaneio, ao finalizar a estampa.
 */
export type ItemCarrinho = {
  produtoId: string
  sku: string
  nome: string
  imagemUrl: string | null
  quantidade: number
}

type Contexto = {
  itens: ItemCarrinho[]
  totalUnidades: number
  adicionar: (item: Omit<ItemCarrinho, 'quantidade'>, qtd: number) => void
  definir: (produtoId: string, qtd: number) => void
  remover: (produtoId: string) => void
  limpar: () => void
  notas: string
  setNotas: (v: string) => void
}

const CarrinhoContexto = createContext<Contexto | null>(null)

export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([])
  const [notas, setNotas] = useState('')
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem('carrinho')
      if (salvo) {
        const d = JSON.parse(salvo)
        setItens(d.itens ?? [])
        setNotas(d.notas ?? '')
      }
    } catch {
      // ignora dados corrompidos
    }
    setPronto(true)
  }, [])

  useEffect(() => {
    if (!pronto) return
    try {
      sessionStorage.setItem('carrinho', JSON.stringify({ itens, notas }))
    } catch {
      // ignora se o navegador bloquear
    }
  }, [itens, notas, pronto])

  function adicionar(item: Omit<ItemCarrinho, 'quantidade'>, qtd: number) {
    if (qtd <= 0) return
    setItens((atual) => {
      const existe = atual.find((i) => i.produtoId === item.produtoId)
      if (existe) {
        return atual.map((i) =>
          i.produtoId === item.produtoId
            ? { ...i, quantidade: qtd, imagemUrl: item.imagemUrl }
            : i
        )
      }
      return [...atual, { ...item, quantidade: qtd }]
    })
  }

  function definir(produtoId: string, qtd: number) {
    if (qtd <= 0) return remover(produtoId)
    setItens((atual) =>
      atual.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: qtd } : i))
    )
  }

  function remover(produtoId: string) {
    setItens((atual) => atual.filter((i) => i.produtoId !== produtoId))
  }

  function limpar() {
    setItens([])
    setNotas('')
    try {
      sessionStorage.removeItem('carrinho')
    } catch {
      // ignora
    }
  }

  const totalUnidades = itens.reduce((a, i) => a + i.quantidade, 0)

  return (
    <CarrinhoContexto.Provider
      value={{
        itens,
        totalUnidades,
        adicionar,
        definir,
        remover,
        limpar,
        notas,
        setNotas,
      }}
    >
      {children}
    </CarrinhoContexto.Provider>
  )
}

export function useCarrinho() {
  const ctx = useContext(CarrinhoContexto)
  if (!ctx) throw new Error('useCarrinho precisa estar dentro de CarrinhoProvider')
  return ctx
}