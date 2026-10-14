import { redirect } from 'next/navigation'

/**
 * Entrada do Estoque. Enquanto os módulos de tecido, capas e locais não
 * chegam, a primeira divisão é a de insumos.
 */
export default function EstoquePage() {
  redirect('/admin/estoque/suprimentos')
}
