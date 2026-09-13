'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CardProduto from './card-produto'
import EditarColecao from '@/components/editar-colecao'
import Paginacao from '@/components/paginacao'
import { casa, termosDe, useBusca } from '@/components/busca-contexto'

/** Artes por página. Catálogo grande não cabe numa rolagem só. */
const POR_PAGINA = 50

export type ArteCatalogo = {
  id: string
  catalogoId: string
  sku: string
  nome: string
  imagemUrl: string | null
}

export type ColecaoCatalogo = {
  id: string
  nome: string
  descricao: string | null
}

export default function ListaCatalogo({
  colecoes,
  artes,
}: {
  colecoes: ColecaoCatalogo[]
  artes: ArteCatalogo[]
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

  // Página corrente por coleção, guardada junto do termo que a produziu:
  // busca nova recomeça da primeira página sem precisar de efeito
  const [estado, setEstado] = useState<{
    termo: string
    paginas: Record<string, number>
  }>({ termo: '', paginas: {} })

  const paginas = estado.termo === termo ? estado.paginas : {}

  function definirPagina(colecaoId: string, n: number) {
    setEstado({ termo, paginas: { ...paginas, [colecaoId]: n } })
  }

  // Preferência de visualização, não posição: não volta a paginar quando a
  // pessoa digita na busca
  const [verTudo, setVerTudo] = useState<Record<string, boolean>>({})

  function alternarVerTudo(colecaoId: string) {
    setVerTudo((atual) => ({ ...atual, [colecaoId]: !atual[colecaoId] }))
  }

  const opcoesColecao = useMemo(
    () => colecoes.map((c) => ({ id: c.id, nome: c.nome })),
    [colecoes]
  )

  const secoes = colecoes
    .map((colecao) => ({
      colecao,
      artes: encontradas.filter((a) => a.catalogoId === colecao.id),
    }))
    .filter((s) => s.artes.length > 0)

  if (secoes.length === 0) {
    return (
      <div className="border border-dashed border-[#DDDCD5] rounded-sm py-16 text-center">
        <p className="text-sm text-[#6E6E68]">
          {filtrando
            ? 'Nenhuma arte do seu catálogo bate com essa busca.'
            : 'Seu catálogo ainda está sendo montado.'}
        </p>
        {!filtrando && (
          <p className="text-xs text-[#6E6E68] mt-2">
            Envie suas artes pelo botão abaixo para começarmos.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {secoes.map(({ colecao, artes: daColecao }) => (
        <SecaoColecao
          key={colecao.id}
          colecao={colecao}
          artes={daColecao}
          opcoesColecao={opcoesColecao}
          mostrarTitulo={colecoes.length > 1}
          pagina={paginas[colecao.id] ?? 1}
          aoMudarPagina={(n) => definirPagina(colecao.id, n)}
          verTudo={!!verTudo[colecao.id]}
          aoAlternarVerTudo={() => alternarVerTudo(colecao.id)}
        />
      ))}
    </div>
  )
}

function SecaoColecao({
  colecao,
  artes,
  opcoesColecao,
  mostrarTitulo,
  pagina,
  aoMudarPagina,
  verTudo,
  aoAlternarVerTudo,
}: {
  colecao: ColecaoCatalogo
  artes: ArteCatalogo[]
  opcoesColecao: { id: string; nome: string }[]
  mostrarTitulo: boolean
  pagina: number
  aoMudarPagina: (n: number) => void
  verTudo: boolean
  aoAlternarVerTudo: () => void
}) {
  const topo = useRef<HTMLElement>(null)

  const totalPaginas = Math.max(1, Math.ceil(artes.length / POR_PAGINA))
  // Se a busca encolheu a lista, a página guardada pode não existir mais
  const atual = Math.min(pagina, totalPaginas)
  const inicio = verTudo ? 0 : (atual - 1) * POR_PAGINA
  const visiveis = verTudo ? artes : artes.slice(inicio, inicio + POR_PAGINA)

  function irPara(n: number) {
    aoMudarPagina(n)
    // Trocar de página no fim da grade deixaria o usuário no rodapé da nova
    topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section ref={topo} className="scroll-mt-4">
      {mostrarTitulo && (
        <div className="flex items-center justify-between gap-3 pb-1.5 mb-3 border-b border-[#131A2E]">
          <div className="min-w-0">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#131A2E]">
              {colecao.nome}
            </h2>
            {colecao.descricao && (
              <p className="text-[11px] text-[#9B9A93]">{colecao.descricao}</p>
            )}
          </div>
          <div className="shrink-0">
            <EditarColecao
              catalogoId={colecao.id}
              nomeAtual={colecao.nome}
              descricaoAtual={colecao.descricao}
              compacto
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visiveis.map((p, idx) => (
          <CardProduto
            key={p.id}
            prioridade={idx < 6}
            produto={{
              id: p.id,
              sku: p.sku,
              nome: p.nome,
              catalogoId: p.catalogoId,
            }}
            imagemUrl={p.imagemUrl}
            colecoes={opcoesColecao}
          />
        ))}
      </div>

      <Paginacao
        pagina={atual}
        totalPaginas={totalPaginas}
        aoMudar={irPara}
        verTudo={verTudo}
        aoAlternarVerTudo={aoAlternarVerTudo}
        legenda={
          verTudo
            ? artes.length + (artes.length === 1 ? ' arte' : ' artes')
            : inicio + 1 +
              '–' +
              Math.min(inicio + POR_PAGINA, artes.length) +
              ' de ' +
              artes.length +
              (artes.length === 1 ? ' arte' : ' artes')
        }
      />
    </section>
  )
}
