'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CardArte from './card-arte'
import Paginacao from '@/components/paginacao'
import { casa, termosDe, useBusca } from '@/components/busca-contexto'
import { type Colecao } from '@/components/seletor-colecao'

/** Artes por página. Catálogo grande não cabe numa rolagem só. */
const POR_PAGINA = 24

export type ArteAdmin = {
  id: string
  sku: string
  nome: string
  largura: number | null
  altura: number | null
  ativo: boolean
  catalogoId: string
  imagemUrl: string | null
}

export default function ListaArtes({
  artes,
  colecoes,
  podeEditar,
}: {
  artes: ArteAdmin[]
  colecoes: Colecao[]
  podeEditar: boolean
}) {
  const busca = useBusca()
  const termo = busca?.termo ?? ''
  const definirEncontrados = busca?.definirEncontrados

  const termos = useMemo(() => termosDe(termo), [termo])
  const filtrando = termos.length > 0

  // A busca varre o catálogo inteiro, não só a página aberta
  const encontradas = useMemo(
    () => artes.filter((a) => casa(a.sku + ' ' + a.nome, termos)),
    [artes, termos]
  )

  useEffect(() => {
    definirEncontrados?.(filtrando ? encontradas.length : null)
    return () => definirEncontrados?.(null)
  }, [definirEncontrados, filtrando, encontradas.length])

  // Página corrente guardada junto do termo que a produziu: busca nova
  // recomeça da primeira página sem precisar de efeito
  const [estado, setEstado] = useState({ termo: '', pagina: 1 })
  const topo = useRef<HTMLDivElement>(null)

  const pagina = estado.termo === termo ? estado.pagina : 1

  const totalPaginas = Math.max(1, Math.ceil(encontradas.length / POR_PAGINA))
  const atual = Math.min(pagina, totalPaginas)
  const inicio = (atual - 1) * POR_PAGINA
  const visiveis = encontradas.slice(inicio, inicio + POR_PAGINA)

  function irPara(n: number) {
    setEstado({ termo, pagina: n })
    topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={topo} className="mt-8 scroll-mt-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visiveis.map((p) => (
          <CardArte
            key={p.id}
            produto={{
              id: p.id,
              sku: p.sku,
              nome: p.nome,
              largura: p.largura,
              altura: p.altura,
              ativo: p.ativo,
              catalogoId: p.catalogoId,
            }}
            imagemUrl={p.imagemUrl}
            colecoes={colecoes}
            podeEditar={podeEditar}
          />
        ))}

        {visiveis.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3 border border-dashed border-[#DDDCD5] rounded-sm py-12 text-center">
            <p className="text-sm text-[#6E6E68]">
              {filtrando
                ? 'Nenhuma arte deste catálogo bate com essa busca.'
                : 'Nenhuma arte neste catálogo.'}
            </p>
          </div>
        )}
      </div>

      <Paginacao
        pagina={atual}
        totalPaginas={totalPaginas}
        aoMudar={irPara}
        legenda={
          inicio + 1 +
          '–' +
          Math.min(inicio + POR_PAGINA, encontradas.length) +
          ' de ' +
          encontradas.length +
          (encontradas.length === 1 ? ' arte' : ' artes')
        }
      />
    </div>
  )
}
