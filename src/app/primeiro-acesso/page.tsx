import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FormularioPrimeiroAcesso from './formulario'

/**
 * Só lê quem está logado e entrega ao formulário. O desvio para cá (e a saída
 * daqui) é decisão do proxy, que enxerga a marca de senha provisória.
 */
export default async function PrimeiroAcessoPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login')

  return <FormularioPrimeiroAcesso email={user.email} />
}
