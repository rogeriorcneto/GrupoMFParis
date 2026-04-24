/**
 * ElevenLabs WebSocket Streaming - Fase 2 Otimização
 * 
 * Implementa streaming de TTS via WebSocket para redução máxima de delay
 */

import { Router, Request, Response } from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { log } from '../logger.js'

const router = Router()

// ── WebSocket Server Setup ─────────────────────────────────────────────────────

let wss: WebSocketServer | null = null
const TTS_WS_PORT = parseInt(process.env.TTS_WS_PORT || '3002', 10)

function initializeWebSocketServer() {
  if (wss) return wss

  wss = new WebSocketServer({ 
    port: TTS_WS_PORT,
    path: '/tts-websocket'
  })

  wss.on('connection', (ws: WebSocket) => {
    log.info('🔌 Cliente WebSocket conectado para TTS streaming')

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        
        if (message.type === 'tts_request') {
          await handleTTSRequest(ws, message)
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
        }
      } catch (error) {
        log.error({ error }, '❌ Erro ao processar mensagem WebSocket')
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Erro ao processar mensagem' 
        }))
      }
    })

    ws.on('close', () => {
      log.info('🔌 Cliente WebSocket desconectado')
    })

    ws.on('error', (error) => {
      log.error({ error }, '❌ Erro no WebSocket')
    })

    // Enviar confirmação de conexão
    ws.send(JSON.stringify({ 
      type: 'connected', 
      message: 'Conectado ao TTS streaming' 
    }))
  })

  log.info(`🌐 Servidor WebSocket TTS iniciado na porta ${TTS_WS_PORT}`)
  return wss
}

// ── TTS Streaming Handler ─────────────────────────────────────────────────────

async function handleTTSRequest(ws: WebSocket, message: any): Promise<void> {
  const { text, voiceId, requestId } = message
  
  if (!text) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      requestId,
      message: 'Texto é obrigatório' 
    }))
    return
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      requestId,
      message: 'ELEVENLABS_API_KEY não configurada' 
    }))
    return
  }

  try {
    const voiceIdToUse = voiceId || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    
    // Conectar ao WebSocket do ElevenLabs
    const elevenWs = new WebSocket('wss://api.elevenlabs.io/v1/text-to-speech/stream')
    
    elevenWs.on('open', () => {
      // Enviar configuração inicial
      elevenWs.send(JSON.stringify({
        text: text,
        voice_id: voiceIdToUse,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        },
        generation_config: {
          chunk_length_schedule: [50, 90, 120, 180, 240]
        }
      }))
    })

    elevenWs.on('message', (data: Buffer) => {
      try {
        // Repassar chunk de áudio diretamente para o cliente
        ws.send(JSON.stringify({
          type: 'audio_chunk',
          requestId,
          data: Array.from(data) // Converter Buffer para array para JSON
        }))
      } catch (error) {
        log.error({ error }, '❌ Erro ao processar chunk de áudio')
      }
    })

    elevenWs.on('error', (error) => {
      log.error({ error }, '❌ Erro no WebSocket ElevenLabs')
      ws.send(JSON.stringify({ 
        type: 'error', 
        requestId,
        message: 'Erro no serviço TTS' 
      }))
    })

    elevenWs.on('close', () => {
      ws.send(JSON.stringify({ 
        type: 'audio_complete', 
        requestId 
      }))
    })

  } catch (error) {
    log.error({ error }, '❌ Erro ao processar requisição TTS')
    ws.send(JSON.stringify({ 
      type: 'error', 
      requestId,
      message: 'Erro interno no servidor' 
    }))
  }
}

// ── HTTP Endpoints ─────────────────────────────────────────────────────────────

router.post('/stream', async (req: Request, res: Response) => {
  const { text, voiceId } = req.body

  if (!text?.trim()) {
    res.status(400).json({ error: 'Texto é obrigatório' })
    return
  }

  // Inicializar servidor WebSocket se necessário
  const server = initializeWebSocketServer()

  try {
    // Retornar informações de conexão WebSocket
    res.json({
      success: true,
      websocketUrl: `ws://localhost:${TTS_WS_PORT}/tts-websocket`,
      voiceId: voiceId || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
      text: text.trim().slice(0, 800) // Limitar texto
    })
  } catch (error) {
    log.error({ error }, '❌ Erro ao preparar streaming TTS')
    res.status(500).json({ error: 'Erro interno no servidor' })
  }
})

router.get('/status', (_req: Request, res: Response) => {
  const server = initializeWebSocketServer()
  
  res.json({
    websocketServer: {
      running: !!wss,
      port: TTS_WS_PORT,
      path: '/tts-websocket',
      connectedClients: wss ? wss.clients.size : 0
    },
    elevenlabs: {
      apiKeyConfigured: !!process.env.ELEVENLABS_API_KEY,
      defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    }
  })
})

// ── Buffer de Áudio Inteligente ─────────────────────────────────────────────────

class AudioBuffer {
  private buffers: Map<string, Buffer[]> = new Map()
  private maxSize = 10 // Máximo de chunks por buffer

  addChunk(requestId: string, chunk: Buffer): void {
    if (!this.buffers.has(requestId)) {
      this.buffers.set(requestId, [])
    }
    
    const buffer = this.buffers.get(requestId)!
    buffer.push(chunk)
    
    // Manter tamanho máximo
    if (buffer.length > this.maxSize) {
      buffer.shift()
    }
  }

  getBuffer(requestId: string): Buffer[] {
    return this.buffers.get(requestId) || []
  }

  clearBuffer(requestId: string): void {
    this.buffers.delete(requestId)
  }

  getCombinedBuffer(requestId: string): Buffer {
    const chunks = this.getBuffer(requestId)
    return Buffer.concat(chunks)
  }
}

const audioBuffer = new AudioBuffer()

router.post('/buffer/:requestId', (req: Request, res: Response) => {
  const { requestId } = req.params
  const chunks = audioBuffer.getBuffer(requestId)
  
  if (chunks.length === 0) {
    res.status(404).json({ error: 'Buffer não encontrado' })
    return
  }

  const combinedBuffer = Buffer.concat(chunks)
  
  res.set({
    'Content-Type': 'audio/mpeg',
    'Content-Length': combinedBuffer.length,
    'Cache-Control': 'no-cache'
  })
  
  res.send(combinedBuffer)
})

router.delete('/buffer/:requestId', (req: Request, res: Response) => {
  const { requestId } = req.params
  audioBuffer.clearBuffer(requestId)
  res.json({ success: true })
})

// Inicializar servidor WebSocket na startup
initializeWebSocketServer()

export default router
