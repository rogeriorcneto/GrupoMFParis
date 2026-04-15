/**
 * TTS Optimized Endpoint - Fase 1 Otimização
 * 
 * Implementa cache de áudios comuns e otimizações para reduzir delay
 */

import { Router, Request, Response } from 'express'
import { log } from '../logger.js'

const router = Router()

// ── Cache de Áudios Comuns (Fase 1 Otimização) ─────────────────────────────────────

interface CachedAudio {
  data: Buffer
  mimeType: string
  timestamp: number
}

const audioCache = new Map<string, CachedAudio>()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

const COMMON_RESPONSES = {
  loading: 'Processando...',
  error: 'Ocorreu um erro. Pode repetir?',
  thinking: 'Deixe me pensar...',
  thanks: 'Obrigado!',
  bye: 'Até logo!',
  welcome: 'Bem-vindo!',
  ok: 'Entendido.',
  oneMoment: 'Um momento, por favor.'
}

// Inicializar cache com áudios comuns
async function initializeCommonAudios(): Promise<void> {
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    log.warn('ELEVENLABS_API_KEY não configurada, cache de áudios não será inicializado')
    return
  }

  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'

  for (const [key, text] of Object.entries(COMMON_RESPONSES)) {
    try {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        audioCache.set(key, {
          data: buffer,
          mimeType: 'audio/mpeg',
          timestamp: Date.now()
        })
        log.info({ key, size: buffer.length }, '✅ Áudio comum cacheado')
      }
    } catch (error) {
      log.warn({ key, error }, '⚠️ Falha ao cachear áudio comum')
    }
  }
}

// Cleanup automático do cache
setInterval(() => {
  const now = Date.now()
  for (const [key, audio] of audioCache.entries()) {
    if (now - audio.timestamp > CACHE_TTL) {
      audioCache.delete(key)
    }
  }
}, 5 * 60 * 1000) // Limpar a cada 5 minutos

// ── Endpoints ─────────────────────────────────────────────────────────────────────

// Endpoint principal - redireciona para /optimized
router.post('/', async (req: Request, res: Response) => {
  const { text, useCache = true } = req.body

  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/[_~[\]<>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .trim()
    .slice(0, 800)

  // Verificar cache primeiro
  if (useCache) {
    const cacheKey = Object.keys(COMMON_RESPONSES).find(key => 
      cleanText.toLowerCase().includes(COMMON_RESPONSES[key as keyof typeof COMMON_RESPONSES].toLowerCase())
    )
    
    if (cacheKey) {
      const cached = audioCache.get(cacheKey)
      if (cached) {
        log.info({ cacheKey, text: cleanText.slice(0, 30) }, '🎯 Cache hit TTS')
        res.set({
          'Content-Type': cached.mimeType,
          'Content-Length': cached.data.length,
          'Cache-Control': 'public, max-age=600',
          'X-Cache': 'HIT'
        })
        res.send(cached.data)
        return
      }
    }
  }

  // Gerar áudio novo
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    // Fallback para Google TTS
    try {
      const googleResponse = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + process.env.GOOGLE_TTS_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: cleanText },
          voice: { languageCode: 'pt-BR', name: 'pt-BR-Wavenet-B' },
          audioConfig: { audioEncoding: 'MP3' }
        })
      })

      if (googleResponse.ok) {
        const audioData = await googleResponse.json()
        const audioBuffer = Buffer.from(audioData.audioContent, 'base64')
        
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length,
          'Cache-Control': 'public, max-age=600',
          'X-Cache': 'MISS'
        })
        res.send(audioBuffer)
        return
      }
    } catch (error) {
      log.error({ error }, '❌ Google TTS fallback falhou')
    }

    res.status(500).json({ error: 'TTS service unavailable' })
    return
  }

  try {
    const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=600',
      'X-Cache': 'MISS'
    })
    res.send(buffer)
  } catch (error) {
    log.error({ error }, '❌ Erro ao gerar áudio ElevenLabs')
    res.status(500).json({ error: 'Failed to generate audio' })
  }
})

router.post('/optimized', async (req: Request, res: Response) => {
  const { text, useCache = true } = req.body

  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/[_~[\]<>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .trim()
    .slice(0, 800)

  // Verificar cache primeiro
  if (useCache) {
    const cacheKey = Object.keys(COMMON_RESPONSES).find(key => 
      cleanText.toLowerCase().includes(COMMON_RESPONSES[key as keyof typeof COMMON_RESPONSES].toLowerCase())
    )
    
    if (cacheKey) {
      const cached = audioCache.get(cacheKey)
      if (cached) {
        log.info({ cacheKey, text: cleanText.slice(0, 30) }, '🎯 Cache hit TTS')
        res.set({
          'Content-Type': cached.mimeType,
          'Content-Length': cached.data.length,
          'Cache-Control': 'public, max-age=600',
          'X-Cache': 'HIT'
        })
        res.send(cached.data)
        return
      }
    }
  }

  // Gerar áudio novo
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    // Fallback para Google TTS
    try {
      const { generateTTS } = await import('./tts.js')
      const audioBuffer = await generateTTS(cleanText, 'google')
      res.set({
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-Cache': 'MISS'
      })
      res.send(audioBuffer)
      return
    } catch (error) {
      log.error({ error }, '❌ Falha no TTS fallback')
      res.status(500).json({ error: 'TTS service unavailable' })
      return
    }
  }

  try {
    const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=300',
      'X-Cache': 'MISS'
    })
    res.send(buffer)
    
    log.info({ text: cleanText.slice(0, 30), size: buffer.length }, '🔊 TTS gerado')
  } catch (error) {
    log.error({ error, text: cleanText.slice(0, 30) }, '❌ Erro TTS ElevenLabs')
    
    // Tentar fallback
    try {
      const { generateTTS } = await import('./tts.js')
      const audioBuffer = await generateTTS(cleanText, 'google')
      res.set({
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'X-Cache': 'FALLBACK'
      })
      res.send(audioBuffer)
    } catch (fallbackError) {
      log.error({ fallbackError }, '❌ Falha no TTS fallback')
      res.status(500).json({ error: 'TTS service unavailable' })
    }
  }
})

router.get('/cache-status', (_req: Request, res: Response) => {
  const cacheStats = {
    size: audioCache.size,
    keys: Array.from(audioCache.keys()),
    totalMemory: Array.from(audioCache.values()).reduce((sum, audio) => sum + audio.data.length, 0),
    ttl: CACHE_TTL
  }
  res.json(cacheStats)
})

router.post('/cache-warmup', async (_req: Request, res: Response) => {
  try {
    await initializeCommonAudios()
    res.json({ success: true, message: 'Cache warmed up' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to warm up cache' })
  }
})

// Inicializar cache na startup
initializeCommonAudios().catch(console.error)

export default router
