import { buscarCustos, buscarSugestaoCustos, buscarConfigCustosAutomaticos } from '@/app/actions/custos'
import FormularioCustos from './formulario'

export default async function CustosPage({
  searchParams,
}: {
  searchParams: Promise<{ janela?: string }>
}) {
  const { janela } = await searchParams
  const config = await buscarConfigCustosAutomaticos()
  const janelaDias = [30, 60, 90].includes(Number(janela)) ? Number(janela) : config.janelaDias
  const [custos, sugestao] = await Promise.all([buscarCustos(), buscarSugestaoCustos(janelaDias)])

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-6 leading-relaxed">
        Custo de produção por metro impresso. Ao confirmar o romaneio de um
        pedido, o custo vigente é gravado nele — atualizar aqui não altera o
        lucro já apurado de pedidos anteriores.
      </p>

      <FormularioCustos custos={custos} sugestao={sugestao} config={config} />
    </div>
  )
}
