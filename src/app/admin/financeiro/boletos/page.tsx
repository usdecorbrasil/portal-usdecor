import { redirect } from 'next/navigation'

/** A aba Boletos virou "A receber" (08/10/2026); o endereço antigo continua valendo. */
export default function BoletosPage() {
  redirect('/admin/financeiro/a-receber')
}
