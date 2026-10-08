import { buscarCustos } from '@/app/actions/custos'
import FormularioCustos from './formulario'

export default async function CustosPage() {
  const custos = await buscarCustos()

  return (
    <div>
      <p className="text-sm text-[#6E6E68] mb-6 leading-relaxed">
        Custo de produção por metro impresso. Ao confirmar o romaneio de um
        pedido, o custo vigente é gravado nele — atualizar aqui não altera o
        lucro já apurado de pedidos anteriores.
      </p>

      <FormularioCustos custos={custos} />
    </div>
  )
}
