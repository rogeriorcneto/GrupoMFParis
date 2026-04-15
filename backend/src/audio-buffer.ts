/**
 * Audio Buffer Inteligente - Fase 2 Otimização
 * 
 * Implementa buffer circular para streaming de áudio com overlap
 */

import { log } from './logger.js'

export interface AudioChunk {
  data: Buffer
  timestamp: number
  sequenceId: number
}

export interface BufferedAudio {
  chunks: AudioChunk[]
  totalSize: number
  firstTimestamp: number
  lastTimestamp: number
}

export class IntelligentAudioBuffer {
  private buffers: Map<string, BufferedAudio> = new Map()
  private maxBufferSize = 5 * 1024 * 1024 // 5MB por buffer
  private maxChunkAge = 30000 // 30 segundos
  private cleanupInterval: NodeJS.Timeout
  private sequenceCounter = 0

  constructor() {
    // Cleanup automático a cada 10 segundos
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 10000)
  }

  /**
   * Adiciona um chunk de áudio ao buffer
   */
  addChunk(requestId: string, data: Buffer): void {
    const now = Date.now()
    const sequenceId = ++this.sequenceCounter

    if (!this.buffers.has(requestId)) {
      this.buffers.set(requestId, {
        chunks: [],
        totalSize: 0,
        firstTimestamp: now,
        lastTimestamp: now
      })
    }

    const buffer = this.buffers.get(requestId)!
    const chunk: AudioChunk = { data, timestamp: now, sequenceId }

    buffer.chunks.push(chunk)
    buffer.totalSize += data.length
    buffer.lastTimestamp = now

    // Manter tamanho máximo do buffer
    if (buffer.totalSize > this.maxBufferSize) {
      this.removeOldestChunks(buffer)
    }

    log.debug({ 
      requestId, 
      chunkSize: data.length, 
      totalSize: buffer.totalSize, 
      sequenceId 
    }, '🎵 Audio chunk adicionado ao buffer')
  }

  /**
   * Obtém chunks para reprodução (com overlap suave)
   */
  getChunksForPlayback(requestId: string, fromSequenceId = 0): AudioChunk[] {
    const buffer = this.buffers.get(requestId)
    if (!buffer || buffer.chunks.length === 0) {
      return []
    }

    // Retornar chunks a partir do sequenceId especificado
    return buffer.chunks.filter(chunk => chunk.sequenceId > fromSequenceId)
  }

  /**
   * Obtém todos os chunks concatenados para download
   */
  getCompleteAudio(requestId: string): Buffer | null {
    const buffer = this.buffers.get(requestId)
    if (!buffer || buffer.chunks.length === 0) {
      return null
    }

    // Ordenar chunks por sequenceId
    const sortedChunks = [...buffer.chunks].sort((a, b) => a.sequenceId - b.sequenceId)
    return Buffer.concat(sortedChunks.map(chunk => chunk.data))
  }

  /**
   * Verifica se o buffer tem chunks disponíveis
   */
  hasChunks(requestId: string): boolean {
    const buffer = this.buffers.get(requestId)
    return buffer ? buffer.chunks.length > 0 : false
  }

  /**
   * Obtém estatísticas do buffer
   */
  getBufferStats(requestId: string): any {
    const buffer = this.buffers.get(requestId)
    if (!buffer) {
      return null
    }

    const now = Date.now()
    const age = now - buffer.firstTimestamp
    const chunkCount = buffer.chunks.length

    return {
      requestId,
      chunkCount,
      totalSize: buffer.totalSize,
      age,
      averageChunkSize: chunkCount > 0 ? buffer.totalSize / chunkCount : 0,
      firstTimestamp: buffer.firstTimestamp,
      lastTimestamp: buffer.lastTimestamp,
      oldestChunkAge: chunkCount > 0 ? now - buffer.chunks[0].timestamp : 0
    }
  }

  /**
   * Limpa buffer específico
   */
  clearBuffer(requestId: string): void {
    const buffer = this.buffers.get(requestId)
    if (buffer) {
      log.info({ requestId, totalSize: buffer.totalSize }, '🗑️ Buffer de áudio limpo')
      this.buffers.delete(requestId)
    }
  }

  /**
   * Remove chunks mais antigos para manter tamanho máximo
   */
  private removeOldestChunks(buffer: BufferedAudio): void {
    while (buffer.totalSize > this.maxBufferSize && buffer.chunks.length > 1) {
      const oldestChunk = buffer.chunks.shift()!
      buffer.totalSize -= oldestChunk.data.length
      buffer.firstTimestamp = buffer.chunks[0]?.timestamp || buffer.lastTimestamp
    }
  }

  /**
   * Cleanup automático de buffers antigos
   */
  private cleanup(): void {
    const now = Date.now()
    const toDelete: string[] = []

    for (const [requestId, buffer] of this.buffers.entries()) {
      const age = now - buffer.lastTimestamp
      
      if (age > this.maxChunkAge) {
        toDelete.push(requestId)
      }
    }

    for (const requestId of toDelete) {
      this.clearBuffer(requestId)
    }

    if (toDelete.length > 0) {
      log.info({ deletedBuffers: toDelete.length }, '🧹 Cleanup de buffers antigos')
    }
  }

  /**
   * Obtém estatísticas globais
   */
  getGlobalStats(): any {
    const now = Date.now()
    let totalBuffers = 0
    let totalChunks = 0
    let totalSize = 0
    let activeBuffers = 0

    for (const [requestId, buffer] of this.buffers.entries()) {
      totalBuffers++
      totalChunks += buffer.chunks.length
      totalSize += buffer.totalSize
      
      const age = now - buffer.lastTimestamp
      if (age < 5000) { // Ativo se modificado nos últimos 5 segundos
        activeBuffers++
      }
    }

    return {
      totalBuffers,
      activeBuffers,
      totalChunks,
      totalSize,
      averageBufferSize: totalBuffers > 0 ? totalSize / totalBuffers : 0,
      memoryUsageMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
    }
  }

  /**
   * Destrói o buffer e limpa recursos
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.buffers.clear()
  }
}

// Singleton global
export const audioBuffer = new IntelligentAudioBuffer()

// Cleanup no shutdown do processo
process.on('SIGINT', () => {
  audioBuffer.destroy()
  process.exit(0)
})

process.on('SIGTERM', () => {
  audioBuffer.destroy()
  process.exit(0)
})
