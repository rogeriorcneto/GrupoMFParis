/**
 * TTS (Text-to-Speech) endpoint — CRM MF Paris
 *
 * Suporta:
 *  1. ElevenLabs  — qualidade máxima, voz ultrarrealista
 *  2. Google Cloud TTS Neural2 — gratuito até 1M chars/mês
 *
 * POST /api/tts
 * Body: { text: string, provider?: 'elevenlabs' | 'google' }
 * Returns: audio/mpeg stream
 *
 * API keys via env vars:
 *   ELEVENLABS_API_KEY
 *   GOOGLE_TTS_API_KEY   (Google Cloud API key com TTS habilitado)
 */

import { Router, Request, Response } from 'express'
import { log } from '../logger.js'

const router = Router()

// ── Voice IDs ──────────────────────────────────────────────────────────────
// ElevenLabs: "Rachel" (en) or "Serena" - best for naturalness
// For pt-BR use voice_id of a cloned/multilingual voice.
// Recommended free voices that speak pt-BR well:
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL' // "Sarah" - multilingual, natural pt-BR

// Google TTS: pt-BR Neural2-A (female) or Neural2-B (male)
const GOOGLE_VOICE_NAME = process.env.GOOGLE_TTS_VOICE || 'pt-BR-Neural2-C' // warm female voice

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────

async function elevenlabsTTS(text: string, apiKey: string): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text.slice(0, 800),
      model_id: 'eleven_multilingual_v2', // supports pt-BR natively
      voice_settings: {
        stability: 0.45,           // slight variation = more natural
        similarity_boost: 0.80,
        style: 0.30,               // expressiveness
        use_speaker_boost: true,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`ElevenLabs error ${response.status}: ${err}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ── Google Cloud TTS ────────────────────────────────────────────────────────

async function googleTTS(text: string, apiKey: string): Promise<Buffer> {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: text.slice(0, 5000) },
      voice: {
        languageCode: 'pt-BR',
        name: GOOGLE_VOICE_NAME,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
        effectsProfileId: ['headphone-class-device'],
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Google TTS error ${response.status}: ${err}`)
  }

  const data: any = await response.json()
  if (!data.audioContent) throw new Error('Google TTS: no audioContent in response')
  return Buffer.from(data.audioContent, 'base64')
}

// ── Route ───────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { text, provider } = req.body as { text?: string; provider?: string }

  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const clean = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/[_~[\]<>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .trim()
    .slice(0, 800)

  const elevenKey = process.env.ELEVENLABS_API_KEY
  const googleKey = process.env.GOOGLE_TTS_API_KEY

  // Auto-select provider: prefer ElevenLabs if key exists, else Google
  const selectedProvider = provider ||
    (elevenKey ? 'elevenlabs' : googleKey ? 'google' : 'none')

  log.info({ provider: selectedProvider, chars: clean.length }, '🔊 TTS request')

  try {
    let audioBuffer: Buffer

    if (selectedProvider === 'elevenlabs' && elevenKey) {
      audioBuffer = await elevenlabsTTS(clean, elevenKey)
    } else if (selectedProvider === 'google' && googleKey) {
      audioBuffer = await googleTTS(clean, googleKey)
    } else {
      // No TTS key configured — signal frontend to use browser fallback
      res.status(503).json({ error: 'no_tts_configured', fallback: true })
      return
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-cache',
    })
    res.send(audioBuffer)
  } catch (err: any) {
    log.error({ err }, '🔊 TTS error')
    res.status(500).json({ error: err?.message || 'TTS error', fallback: true })
  }
})

// ── Config check ─────────────────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    google: !!process.env.GOOGLE_TTS_API_KEY,
    activeProvider: process.env.ELEVENLABS_API_KEY
      ? 'elevenlabs'
      : process.env.GOOGLE_TTS_API_KEY
      ? 'google'
      : 'browser',
    voiceId: ELEVENLABS_VOICE_ID,
    googleVoice: GOOGLE_VOICE_NAME,
  })
})

export default router
