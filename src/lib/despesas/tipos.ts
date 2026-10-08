/** Tipos de documento de despesa — puro, serve no navegador e no servidor. */
export const TIPOS_DOCUMENTO = ['nfe', 'nfce', 'nfse', 'cupom', 'recibo', 'boleto', 'outro'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]
