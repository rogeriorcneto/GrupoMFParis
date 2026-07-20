import type { Cliente } from '../types'

export interface EtapaDuracao {
  etapa: string
  dias: number
  entrada: string
  saida?: string
  clienteId?: number
  clienteNome?: string
  vendedorId?: number
  vendedorNome?: string
}

export function calcularDuracoesEtapas(cliente: Cliente, agora = new Date()): EtapaDuracao[] {
  const now = agora.getTime()
  const hist = [...(cliente.historicoEtapas || [])].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  const result: EtapaDuracao[] = []

  if (hist.length > 0) {
    const startInitial = cliente.criadoEm ? new Date(cliente.criadoEm).getTime() : new Date(hist[0].data).getTime()
    const endInitial = new Date(hist[0].data).getTime()
    result.push({ etapa: hist[0].de || 'lead', dias: Math.max(0, Math.floor((endInitial - startInitial) / 86400000)), entrada: new Date(startInitial).toISOString(), saida: hist[0].data })

    for (let i = 1; i < hist.length; i++) {
      const start = new Date(hist[i - 1].data).getTime()
      const end = new Date(hist[i].data).getTime()
      const etapa = hist[i].de || hist[i - 1].etapa || 'desconhecido'
      result.push({ etapa, dias: Math.max(0, Math.floor((end - start) / 86400000)), entrada: hist[i - 1].data, saida: hist[i].data })
    }

    const lastStart = new Date(hist[hist.length - 1].data).getTime()
    result.push({ etapa: cliente.etapa, dias: Math.max(0, Math.floor((now - lastStart) / 86400000)), entrada: hist[hist.length - 1].data })
  } else {
    const start = cliente.dataEntradaEtapa ? new Date(cliente.dataEntradaEtapa).getTime() : (cliente.criadoEm ? new Date(cliente.criadoEm).getTime() : now)
    result.push({ etapa: cliente.etapa, dias: Math.max(0, Math.floor((now - start) / 86400000)), entrada: new Date(start).toISOString() })
  }

  return result
}

export function diasEtapaAtual(cliente: Cliente, agora = new Date()): number {
  const now = agora.getTime()
  const hist = [...(cliente.historicoEtapas || [])].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  const start = hist.length > 0 ? new Date(hist[hist.length - 1].data).getTime() : (cliente.dataEntradaEtapa ? new Date(cliente.dataEntradaEtapa).getTime() : (cliente.criadoEm ? new Date(cliente.criadoEm).getTime() : now))
  return Math.max(0, Math.floor((now - start) / 86400000))
}
