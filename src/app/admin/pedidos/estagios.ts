/**
 * Rótulos, ordem e paleta dos estágios do pedido.
 * Compartilhado entre a página (server) e o quadro arrastável (client).
 */

export const ROTULOS: Record<string, string> = {
  aguardando: 'Aguardando confirmação',
  recebido: 'Pedido confirmado',
  impressao: 'Impressão',
  estampando: 'Estampando',
  corte_costura: 'Em corte / costura',
  pronto: 'Pedido pronto',
  nf_emitida: 'Nota fiscal emitida',
  expedido: 'Expedido',
  entregue: 'Entregue',
}

export const ATIVOS = [
  'aguardando', 'recebido', 'impressao', 'estampando', 'corte_costura',
  'pronto', 'nf_emitida', 'expedido', 'entregue',
]

export const EM_PRODUCAO = [
  'recebido', 'impressao', 'estampando', 'corte_costura', 'pronto',
]

/** Etapas que o painel lança à mão — as demais chegam do Bling. */
export const MANUAIS = ['impressao', 'estampando', 'corte_costura', 'pronto']

/**
 * Para onde um pedido em `origem` pode ser arrastado. Espelha a regra do
 * painel do pedido: uma etapa por vez, exceto saindo de Estampando, onde a
 * costura pode ser pulada.
 */
export function destinosPermitidos(origem: string): string[] {
  if (origem === 'aguardando') return []
  if (origem === 'estampando') return ['corte_costura', 'pronto']
  const proxima = ATIVOS[ATIVOS.indexOf(origem) + 1]
  return proxima && MANUAIS.includes(proxima) ? [proxima] : []
}

export function sinal(status: string, dias: number) {
  if (status === 'aguardando') {
    return { cl: 'novo', tx: 'Aguardando sua confirmação' }
  }
  if (!EM_PRODUCAO.includes(status)) {
    return { cl: 'bling', tx: 'Aguardando o Bling' }
  }
  if (dias >= 4) return { cl: 'crit', tx: 'Parado há ' + dias + ' dias' }
  if (dias >= 2) return { cl: 'aten', tx: 'Parado há ' + dias + ' dias' }
  return {
    cl: 'ok',
    tx: dias === 0 ? 'Movimentado hoje' : 'Movimentado ontem',
  }
}

export function nivelUrgencia(cl: string) {
  if (cl === 'crit' || cl === 'novo') return 'forte'
  if (cl === 'aten') return 'medio'
  return 'leve'
}

export type Tons = {
  leve: string
  medio: string
  forte: string
}

export type CorEstagio = {
  fundo: string
  borda: string
  texto: string
  tarja: Tons
}

export const CORES_ESTAGIO: { [key: string]: CorEstagio } = {
  aguardando: {
    fundo: 'bg-[#EEF3F7]',
    borda: 'border-[#8FADC4]',
    texto: 'text-[#4A6B85]',
    tarja: {
      leve: 'bg-[#E4EDF3] text-[#5D7A93]',
      medio: 'bg-[#C7D9E6] text-[#3D5870]',
      forte: 'bg-[#9FBBCF] text-[#24384A]',
    },
  },
  recebido: {
    fundo: 'bg-[#EEF5F4]',
    borda: 'border-[#85B0AC]',
    texto: 'text-[#457066]',
    tarja: {
      leve: 'bg-[#E2EEEC] text-[#4F7A72]',
      medio: 'bg-[#BEDAD5] text-[#2F5850]',
      forte: 'bg-[#8FBBB3] text-[#1D3B34]',
    },
  },
  impressao: {
    fundo: 'bg-[#F7F1E6]',
    borda: 'border-[#C4A868]',
    texto: 'text-[#8A6E33]',
    tarja: {
      leve: 'bg-[#F0E5CC] text-[#93773D]',
      medio: 'bg-[#DFC896] text-[#6B5320]',
      forte: 'bg-[#C4A868] text-[#4A3810]',
    },
  },
  estampando: {
    fundo: 'bg-[#F2EFF7]',
    borda: 'border-[#A997C4]',
    texto: 'text-[#6B5787]',
    tarja: {
      leve: 'bg-[#E8E2F0] text-[#766093]',
      medio: 'bg-[#D0C2E3] text-[#55406F]',
      forte: 'bg-[#A997C4] text-[#382953]',
    },
  },
  corte_costura: {
    fundo: 'bg-[#F7EFF3]',
    borda: 'border-[#C495AC]',
    texto: 'text-[#8A4F66]',
    tarja: {
      leve: 'bg-[#F0E1E8] text-[#93586F]',
      medio: 'bg-[#E0BECE] text-[#6B324A]',
      forte: 'bg-[#C495AC] text-[#4A1E30]',
    },
  },
  pronto: {
    fundo: 'bg-[#EEF4F0]',
    borda: 'border-[#85AD92]',
    texto: 'text-[#45664F]',
    tarja: {
      leve: 'bg-[#E1EDE4] text-[#4F7358]',
      medio: 'bg-[#BDD9C6] text-[#2F4E37]',
      forte: 'bg-[#8CB399] text-[#1D3323]',
    },
  },
  nf_emitida: {
    fundo: 'bg-[#EFF1F6]',
    borda: 'border-[#92A0C0]',
    texto: 'text-[#4E5D80]',
    tarja: {
      leve: 'bg-[#E4E7F0] text-[#586A8E]',
      medio: 'bg-[#C4CBE1] text-[#3A4763]',
      forte: 'bg-[#92A0C0] text-[#262F45]',
    },
  },
  expedido: {
    fundo: 'bg-[#F7F0E7]',
    borda: 'border-[#C4A17A]',
    texto: 'text-[#8A6541]',
    tarja: {
      leve: 'bg-[#F0E3D1] text-[#93714A]',
      medio: 'bg-[#E0C6A3] text-[#6B4D2C]',
      forte: 'bg-[#C4A17A] text-[#4A3419]',
    },
  },
  entregue: {
    fundo: 'bg-[#EEF4EF]',
    borda: 'border-[#7FAA8B]',
    texto: 'text-[#416150]',
    tarja: {
      leve: 'bg-[#E1EEE3] text-[#4A6F57]',
      medio: 'bg-[#B9D8C2] text-[#2C4C38]',
      forte: 'bg-[#85B594] text-[#1B3325]',
    },
  },
}
