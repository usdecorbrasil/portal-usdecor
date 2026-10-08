/**
 * Unidades aceitas no cadastro de suprimentos. Fica fora de
 * `app/actions/suprimentos.ts` porque arquivo 'use server' só pode exportar
 * funções assíncronas: exportar esta lista de lá quebrava a página.
 */
export const UNIDADES = ['un', 'L', 'mL', 'kg', 'g', 'm', 'rolo', 'cx', 'pct'] as const
export type Unidade = (typeof UNIDADES)[number]
