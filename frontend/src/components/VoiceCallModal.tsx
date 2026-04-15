/**
 * VoiceCallModal — Chamada de voz para a IA do CRM
 *
 * Speech-to-Text: Web Speech API nativa (Chrome/Edge, pt-BR)
 * Text-to-Speech: ElevenLabs ou Google TTS Neural via backend /api/tts
 *                 Fallback automático para browser SpeechSynthesis
 * AI:             Gemini com contexto completo do CRM
 */
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { PhoneXMarkIcon } from '@heroicons/react/24/solid'
import type { AIMessage } from '../lib/gemini'
import { supabase } from '../lib/supabase'

// Always use Railway backend directly for voice calls — Netlify functions have
// a 10s timeout which is too short for AI + TTS combined
const BOT_URL = (
  (import.meta as any).env?.VITE_BOT_URL ||
  'https://grupomfparis-production.up.railway.app'
)

interface VoiceCallModalProps {
  systemPrompt: string
  loggedUserName: string
  onClose: () => void
}

type CallState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

interface Turn { role: 'user' | 'assistant'; text: string }

// ── Cache de Contexto (Fase 1 Otimização) ───────────────────────────────────────

interface CachedContext {
  clienteData?: any
  vendedorData?: any
  timestamp: number
}

const contextCache = new Map<string, CachedContext>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

async function getCachedContext(key: string, loader: () => Promise<any>): Promise<any> {
  const cached = contextCache.get(key)
  const now = Date.now()
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached[key.includes('cliente') ? 'clienteData' : 'vendedorData']
  }
  
  const data = await loader()
  contextCache.set(key, {
    [key.includes('cliente') ? 'clienteData' : 'vendedorData']: data,
    timestamp: now
  })
  
  return data
}

// ── Pré-buffering de Áudios Comuns (Fase 1 Otimização) ─────────────────────────────

interface AudioBuffer {
  loading: HTMLAudioElement | null
  error: HTMLAudioElement | null
  thinking: HTMLAudioElement | null
}

const commonAudioCache: AudioBuffer = {
  loading: null,
  error: null,
  thinking: null
}

async function preloadCommonAudios(): Promise<void> {
  const elevenKey = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY
  if (!elevenKey) return

  const commonTexts = {
    loading: 'Processando...',
    error: 'Ocorreu um erro. Pode repetir?',
    thinking: 'Deixe-me pensar...'
  }

  for (const [key, text] of Object.entries(commonTexts)) {
    try {
      const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
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

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.preload = 'auto'
        commonAudioCache[key as keyof AudioBuffer] = audio
      }
    } catch (e) {
      console.warn(`[TTS] Failed to preload ${key}:`, e)
    }
  }
}

function playCachedAudio(key: keyof AudioBuffer): Promise<void> {
  const audio = commonAudioCache[key]
  if (audio) {
    return audio.play()
  }
  return Promise.reject(new Error(`Audio ${key} not cached`))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSpeechRecognition(): any | null {
  const SpeechRec =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRec) return null
  const rec = new SpeechRec()
  rec.lang = 'pt-BR'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  return rec
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#+\s/g, '')
    .replace(/[_~]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/[<>[\]]/g, '')
    .trim()
}

/** Call Gemini directly via Railway backend (no Netlify function timeout) */
async function callAIVoice(
  messages: AIMessage[],
  systemPrompt: string,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Não autenticado')

  const res = await fetch(`${BOT_URL}/api/gemini`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, systemInstruction: systemPrompt }),
  })

  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json()
  return data.response || data.message || 'Entendido.'
}

/** Call Gemini streaming (Fase 3) - Edge Functions com cache global */
async function callAIVoiceStream(
  messages: AIMessage[],
  systemPrompt: string,
  onChunk: (chunk: string, accumulated: string) => void,
  onTTS: (sentence: string, isFinal?: boolean) => void
): Promise<string> {
  console.log('[AI] Iniciando chamada de IA...')
  
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    console.error('[AI] Usuário não autenticado')
    throw new Error('Não autenticado')
  }

  console.log('[AI] Token obtido, tentando Edge Function...')
  
  // Tentar Edge Function primeiro (Fase 3)
  let res: Response
  
  try {
    res = await fetch('/api/gemini-edge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        messages, 
        systemInstruction: systemPrompt,
        useEdgeCache: true
      }),
    })

    console.log('[AI] Edge Function response:', res.status, res.statusText)
    
    if (!res.ok) {
      throw new Error(`Edge Function ${res.status}: ${res.statusText}`)
    }
    console.log('🚀 Usando Gemini Edge Function (Fase 3)')
  } catch (edgeError) {
    console.warn('⚠️ Edge Function falhou, usando backend (Fase 2):', edgeError)
    
    // Fallback para backend streaming
    try {
      res = await fetch(`${BOT_URL}/api/gemini-stream/stream-with-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      console.log('[AI] Backend streaming response:', res.status, res.statusText)
      
      if (!res.ok) {
        throw new Error(`Backend Stream ${res.status}: ${res.statusText}`)
      }
      console.log('🔄 Usando Backend Stream (Fase 2)')
    } catch (backendError) {
      console.warn('⚠️ Backend streaming falhou, usando API simples:', backendError)
      
      // Fallback final para API simples
      res = await fetch(`${BOT_URL}/api/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          messages, 
          systemInstruction: systemPrompt
        }),
      })

      console.log('[AI] API simples response:', res.status, res.statusText)
      
      if (!res.ok) {
        throw new Error(`API Simples ${res.status}: ${res.statusText}`)
      }
      
      console.log('🔄 Usando API Simples (Fallback)')
      
      // Para API simples, processar resposta normal
      const data = await res.json()
      const response = data.response || data.message || 'Entendido.'
      
      console.log('[AI] Resposta da API simples:', response)
      
      // Simular chunks para compatibilidade
      onChunk(response, response)
      onTTS(response, true)
      
      return response
    }
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Stream não disponível')

  const decoder = new TextDecoder()
  let accumulatedText = ''
  let sentenceBuffer = ''

  try {
    console.log('[AI] Iniciando processamento do streaming...')
    let chunkCount = 0
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        console.log('[AI] Streaming concluído, chunks processados:', chunkCount)
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      chunkCount++
      
      console.log('[AI] Chunk recebido:', chunkCount, chunk.length, 'bytes')
      
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            console.log('[AI] Data parsed:', { hasText: !!data.text, hasTTSTrigger: !!data.ttsTrigger, done: data.done, error: data.error })
            
            if (data.text) {
              accumulatedText += data.text
              sentenceBuffer += data.text
              console.log('[AI] Chamando onChunk:', data.text)
              onChunk(data.text, accumulatedText)
            }
            
            if (data.ttsTrigger && data.sentence) {
              console.log('[AI] Chamando onTTS:', data.sentence, data.final)
              onTTS(data.sentence, data.final)
              if (!data.final) {
                sentenceBuffer = sentenceBuffer.replace(data.sentence, '')
              }
            }
            
            if (data.done) {
              console.log('[AI] Streaming finalizado, texto acumulado:', accumulatedText.trim())
              return accumulatedText.trim()
            }
            
            if (data.error) {
              console.error('[AI] Erro no streaming:', data.error)
              throw new Error(data.error)
            }
          } catch (e) {
            console.warn('[AI] Erro ao parsear linha:', line, e)
            // Ignorar erros de parse
          }
        }
      }
    }
  } finally {
    console.log('[AI] Liberando reader...')
    reader.releaseLock()
  }

  console.log('[AI] Retornando texto acumulado:', accumulatedText.trim())
  return accumulatedText.trim()
}

/** Speak using neural TTS streaming (Fase 2) - delay mínimo com WebSocket */
async function speakNeuralStream(
  text: string, 
  onEnd: () => void, 
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
): Promise<void> {
  const clean = stripMarkdown(text).slice(0, 700)

  // Stop any current playback
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current.src = ''
    audioRef.current = null
  }
  window.speechSynthesis.cancel()

  // Verificar cache primeiro (Fase 1)
  const cacheKey = Object.keys({
    loading: 'Processando...',
    error: 'Ocorreu um erro. Pode repetir?',
    thinking: 'Deixe me pensar...',
    thanks: 'Obrigado!',
    bye: 'Até logo!',
    welcome: 'Bem-vindo!',
    ok: 'Entendido.',
    oneMoment: 'Um momento, por favor.'
  }).find(key => clean.toLowerCase().includes(key))

  if (cacheKey) {
    try {
      await playCachedAudio(cacheKey as keyof AudioBuffer)
      onEnd()
      return
    } catch (e) {
      console.warn('[TTS] Cache miss, trying streaming')
    }
  }

  // Tentar WebSocket streaming (Fase 2)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('no token')

    // Preparar conexão WebSocket
    const ws = new WebSocket('ws://localhost:8080/tts-websocket')
    
    return new Promise<void>((resolve, reject) => {
      const requestId = `tts_${Date.now()}_${Math.random()}`
      let audioContext: AudioContext | null = null
      let sourceNode: AudioBufferSourceNode | null = null

      ws.onopen = () => {
        console.log('[TTS] WebSocket conectado')
        ws.send(JSON.stringify({
          type: 'tts_request',
          requestId,
          text: clean,
          voiceId: 'EXAVITQu4vr4xnSDxMaL'
        }))
      }

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'audio_chunk' && data.requestId === requestId) {
            // Converter array de volta para Buffer
            const audioData = new Uint8Array(data.data)
            
            // Criar AudioContext se necessário
            if (!audioContext) {
              audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
            }
            
            // Tentar decodificar e reproduzir áudio
            try {
              const audioBuffer = await audioContext.decodeAudioData(audioData.buffer)
              
              if (sourceNode) {
                sourceNode.stop()
                sourceNode.disconnect()
              }
              
              sourceNode = audioContext.createBufferSource()
              sourceNode.buffer = audioBuffer
              sourceNode.connect(audioContext.destination)
              sourceNode.onended = () => {
                if (sourceNode) {
                  sourceNode.disconnect()
                  sourceNode = null
                }
              }
              sourceNode.start()
            } catch (decodeError) {
              console.warn('[TTS] Erro ao decodificar áudio:', decodeError)
            }
          } else if (data.type === 'audio_complete' && data.requestId === requestId) {
            console.log('[TTS] Streaming completo')
            ws.close()
            
            // Pequeno delay para garantir que todo áudio foi reproduzido
            setTimeout(() => {
              if (audioContext) {
                audioContext.close()
              }
              onEnd()
              resolve()
            }, 500)
          } else if (data.type === 'error') {
            console.error('[TTS] Erro no streaming:', data.message)
            ws.close()
            reject(new Error(data.message))
          }
        } catch (parseError) {
          console.error('[TTS] Erro ao parsear mensagem:', parseError)
        }
      }

      ws.onerror = (error) => {
        console.error('[TTS] Erro WebSocket:', error)
        reject(new Error('Erro na conexão WebSocket'))
      }

      ws.onclose = () => {
        console.log('[TTS] WebSocket fechado')
      }

      // Timeout de segurança
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
        if (audioContext) {
          audioContext.close()
        }
        onEnd()
        resolve()
      }, 10000)
    })
  } catch (error) {
    console.warn('[TTS] WebSocket falhou, usando fallback:', error)
    // Fallback para TTS otimizado (Fase 1)
    return speakNeural(text, onEnd, audioRef)
  }
}

/** Speak using neural TTS Edge Function (Fase 3) - cache global máximo */
async function speakNeural(text: string, onEnd: () => void, audioRef: React.MutableRefObject<HTMLAudioElement | null>): Promise<void> {
  const clean = stripMarkdown(text).slice(0, 700)

  // Stop any current playback
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current.src = ''
    audioRef.current = null
  }
  window.speechSynthesis.cancel()

  // Verificar se é resposta comum cacheada
  const cacheKey = Object.keys({
    loading: 'Processando...',
    error: 'Ocorreu um erro. Pode repetir?',
    thinking: 'Deixe me pensar...',
    thanks: 'Obrigado!',
    bye: 'Até logo!',
    welcome: 'Bem-vindo!',
    ok: 'Entendido.',
    oneMoment: 'Um momento, por favor.'
  }).find(key => clean.toLowerCase().includes(key))

  if (cacheKey) {
    try {
      await playCachedAudio(cacheKey as keyof AudioBuffer)
      onEnd()
      return
    } catch (e) {
      console.warn('[TTS] Cache miss, trying backend')
    }
  }

  // Paralelização: Tentar ElevenLabs direto + backend otimizado simultaneamente
  const elevenKey = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY
  
  const promises = []

  // Promise 1: ElevenLabs direto (se tiver key)
  if (elevenKey) {
    promises.push(
      (async () => {
        try {
          const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
          const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elevenKey,
            },
            body: JSON.stringify({
              text: clean,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          })
          if (res.ok) {
            return { source: 'elevenlabs', blob: await res.blob() }
          }
        } catch (e) {
          console.warn('[TTS] ElevenLabs falhou:', e)
        }
        return null
      })()
    )
  }

  // Promise 2: Backend otimizado
  promises.push(
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('no token')

        const res = await fetch(`${BOT_URL}/api/tts-optimized/optimized`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ text: clean, useCache: true }),
        })

        if (res.ok) {
          const cacheHit = res.headers.get('X-Cache') === 'HIT'
          console.log('[TTS] Backend cache:', cacheHit ? 'HIT' : 'MISS')
          return { source: 'backend-optimized', blob: await res.blob(), cacheHit }
        }
      } catch (e) {
        console.warn('[TTS] Backend otimizado falhou:', e)
      }
      return null
    })()
  )

  // Promise 3: Backend fallback (se otimizado falhar)
  promises.push(
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('no token')

        const res = await fetch(`${BOT_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ text: clean }),
        })

        if (res.ok) {
          return { source: 'backend-fallback', blob: await res.blob() }
        }
      } catch (e) {
        console.warn('[TTS] Backend fallback falhou:', e)
      }
      return null
    })()
  )

  // Executar promises em paralelo e usar primeira resposta
  try {
    const results = await Promise.allSettled(promises)
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { source, blob, cacheHit } = result.value
        console.log(`[TTS] Usando: ${source}${cacheHit ? ' (cache hit)' : ''}`)
        
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; onEnd() }
        audio.onerror = (e) => { console.error('[TTS] audio error', e); URL.revokeObjectURL(url); audioRef.current = null; onEnd() }
        await audio.play()
        return
      }
    }
  } catch (e) {
    console.error('[TTS] Todas as opções falharam:', e)
  }

  // Browser fallback final
  console.log('[TTS] Usando fallback browser')
  const utter = new SpeechSynthesisUtterance(clean)
  utter.lang = 'pt-BR'
  utter.rate = 1.0
  const voices = window.speechSynthesis.getVoices()
  const ptVoice = voices.find(v => v.lang === 'pt-BR') || voices.find(v => v.lang.startsWith('pt'))
  if (ptVoice) utter.voice = ptVoice
  utter.onend = onEnd
  utter.onerror = onEnd
  window.speechSynthesis.speak(utter)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoiceCallModal({ systemPrompt, loggedUserName, onClose }: VoiceCallModalProps) {
  const [callState, setCallState] = useState<CallState>('connecting')
  const [transcript, setTranscript] = useState('')
  const [aiText, setAiText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const historyRef = useRef<AIMessage[]>([])
  const recRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const closingRef = useRef(false)

  // ── Timer ──
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      closingRef.current = true
      window.speechSynthesis.cancel()
      recRef.current?.abort()
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [])

  // ── Core: listen → think → speak loop ──────────────────────────────────────

  const startListening = useCallback(() => {
    console.log('[Voice] Iniciando reconhecimento de voz...')
    
    if (closingRef.current) {
      console.log('[Voice] Cancelando - componente fechando')
      return
    }
    
    const rec = getSpeechRecognition()
    if (!rec) {
      console.error('[Voice] Navegador não suporta reconhecimento de voz')
      setError('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      setCallState('error')
      return
    }
    
    console.log('[Voice] SpeechRecognition criado, configurando eventos...')
    recRef.current = rec
    setCallState('listening')
    setTranscript('')

    rec.onresult = async (event) => {
      const result = event.results[0]
      if (!result) return
      
      const interim = result[0]?.transcript?.trim() || ''
      const isFinal = result.isFinal
      
      console.log('[Voice] Resultado recebido:', { interim, isFinal, resultIndex: event.resultIndex })
      
      // Feedback visual imediato com interim results
      if (interim) {
        setTranscript(interim + (isFinal ? '' : '...'))
        
        // Pré-processamento de intenções com interim results
        if (!isFinal && interim.length > 5) {
          const lower = interim.toLowerCase()
          if (['tchau', 'encerrar', 'desligar', 'finalizar', 'até mais'].some(w => lower.includes(w))) {
            // Preparar resposta de despedida antecipadamente
            const bye = `Até logo, ${loggedUserName.split(' ')[0]}!`
            setAiText(bye)
          }
        }
      }
      
      // Processar apenas resultados finais
      if (!isFinal || !interim) {
        console.log('[Voice] Aguardando resultado final...')
        return
      }
      
      console.log('[Voice] Processando resultado final:', interim)

      setTranscript(interim)
      setCallState('thinking')

      // Detect hangup intent
      const lower = interim.toLowerCase()
      if (['tchau', 'encerrar', 'desligar', 'finalizar', 'até mais'].some(w => lower.includes(w))) {
        const bye = `Até logo, ${loggedUserName.split(' ')[0]}! Qualquer coisa pode abrir a chamada novamente.`
        setAiText(bye)
        setCallState('speaking')
        speakNeural(bye, () => { if (!closingRef.current) onClose() }, audioRef)
        return
      }

      // Add to history
      historyRef.current.push({ role: 'user', content: interim })
      if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20)

      setTurns(prev => [...prev, { role: 'user', text: interim }])

      try {
        console.log('[Voice] Iniciando chamada da IA...')
        
        // Streaming Fase 2: Resposta em tempo real
        const voicePrompt = systemPrompt + `\n\n## MODO VOZ ATIVA\nVocê está em uma conversa de VOZ agora. Regras OBRIGATÓRIAS:\n- Respostas CURTAS: máximo 2-3 frases. Nunca use listas ou tabelas.\n- NUNCA diga "Sou a assistente do CRM" ou se apresente novamente — já se apresentou.\n- Fale como colega de trabalho, natural e direto. Sem formalidade.\n- Números: fale por extenso ("mil quatrocentos" não "1400").\n- Se precisar de mais detalhes, faça UMA pergunta só.`
        
        console.log('[Voice] Voice prompt criado, chamando IA...')
        
        let fullResponse = ''
        let isFirstChunk = true
        let hasSpoken = false

        const reply = await callAIVoiceStream(
          historyRef.current, 
          voicePrompt,
          // onChunk: feedback visual em tempo real
          (chunk, accumulated) => {
            console.log('[Voice] onChunk chamado:', chunk, accumulated)
            fullResponse = accumulated
            if (isFirstChunk) {
              console.log('[Voice] Primeiro chunk, definindo texto e estado')
              setAiText(accumulated)
              setCallState('speaking')
              isFirstChunk = false
            } else {
              setAiText(accumulated)
            }
          },
          // onTTS: reproduzir frases conforme chegam
          async (sentence, isFinal) => {
            console.log('[Voice] onTTS chamado:', sentence, isFinal)
            if (!hasSpoken || isFinal) {
              hasSpoken = true
              try {
                console.log('[Voice] Iniciando TTS streaming...')
                await speakNeuralStream(sentence, () => {
                  console.log('[Voice] TTS finalizado, isFinal:', isFinal)
                  if (isFinal && !closingRef.current) {
                    console.log('[Voice] Reiniciando listening após TTS')
                    startListening()
                  }
                }, audioRef)
              } catch (error) {
                console.warn('[TTS] Streaming falhou, usando fallback:', error)
                await speakNeural(sentence, () => {
                  if (isFinal && !closingRef.current) {
                    startListening()
                  }
                }, audioRef)
              }
            }
          }
        )

        console.log('[Voice] Resposta final da IA:', reply)
        
        historyRef.current.push({ role: 'assistant', content: reply })
        setTurns(prev => [...prev, { role: 'assistant', text: reply }])
        
        // Se não falhou nada, garantir que reinicia listening
        if (!hasSpoken && !closingRef.current) {
          console.log('[Voice] Não falhou nada, reiniciando listening em 1s')
          setTimeout(() => startListening(), 1000)
        }
      } catch (error) {
        console.error('[AI] Erro no streaming:', error)
        const errMsg = 'Ocorreu um erro. Pode repetir?'
        setAiText(errMsg)
        setCallState('speaking')
        speakNeural(errMsg, () => { if (!closingRef.current) startListening() }, audioRef)
      }
    }

    rec.onerror = (event) => {
      if (closingRef.current) return
      
      console.error('[Voice] Erro no reconhecimento:', { error: event.error, message: event.message })
      
      if (event.error === 'no-speech') {
        // User didn't say anything — just restart
        console.log('[Voice] Nenhuma fala detectada, reiniciando...')
        setTimeout(() => { if (!closingRef.current) startListening() }, 100)
      } else if (event.error === 'not-allowed') {
        setError('Permissão do microfone negada. Habilite nas configurações do navegador.')
        setCallState('error')
      } else if (event.error === 'network') {
        console.error('[Voice] Erro de rede no reconhecimento')
        setTimeout(() => { if (!closingRef.current) startListening() }, 1000)
      } else {
        // Restart on other errors
        console.log('[Voice] Erro genérico, reiniciando em 500ms...')
        setTimeout(() => { if (!closingRef.current) startListening() }, 500)
      }
    }

    rec.onend = () => {
      // If still in 'listening' state and didn't get result, restart
      // (handles cases where recognition ended without result or error)
      if (closingRef.current) return
      
      // Reiniciar listening se ainda está no estado 'listening'
      // Isso garante continuidade do reconhecimento
      setTimeout(() => {
        if (!closingRef.current && callState === 'listening') {
          console.log('[Voice] Reconhecimento terminou, reiniciando...')
          startListening()
        }
      }, 100)
    }

    rec.start()
  }, [systemPrompt, loggedUserName, onClose])

  // ── Greet on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    // Pré-carregar áudios comuns (Fase 1 otimização)
    preloadCommonAudios().catch(console.warn)

    const firstName = loggedUserName.split(' ')[0]
    const greetings = [
      `E aí, ${firstName}! O que tá rolando?`,
      `Oi ${firstName}, tudo bem? Me fala.`,
      `Oi ${firstName}! Pode falar.`,
    ]
    const greeting = greetings[Math.floor(Math.random() * greetings.length)]
    setAiText(greeting)
    setCallState('speaking')
    historyRef.current.push({ role: 'assistant', content: greeting })
    setTurns([{ role: 'assistant', text: greeting }])

    // Neural TTS doesn't depend on browser voices loading
    const doGreet = () => speakNeural(greeting, () => { if (!closingRef.current) startListening() }, audioRef)
    doGreet()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI ──────────────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    closingRef.current = true
    window.speechSynthesis.cancel()
    recRef.current?.abort()
    onClose()
  }, [onClose])

  const stateLabel: Record<CallState, string> = {
    connecting: 'Conectando...',
    listening:  'Ouvindo você...',
    thinking:   'Pensando...',
    speaking:   'Falando...',
    error:      'Erro',
  }

  const stateColor: Record<CallState, string> = {
    connecting: 'bg-gray-400',
    listening:  'bg-green-500 animate-pulse',
    thinking:   'bg-yellow-400 animate-pulse',
    speaking:   'bg-blue-500 animate-pulse',
    error:      'bg-red-500',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Assistente IA · CRM</div>
          <div className="text-white font-semibold text-lg">{formatTime(elapsedSeconds)}</div>
        </div>

        {/* Avatar + pulse */}
        <div className="flex justify-center py-4">
          <div className="relative">
            {callState === 'listening' && (
              <>
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping scale-150" />
                <div className="absolute inset-0 rounded-full bg-green-500/10 animate-ping scale-125 delay-75" />
              </>
            )}
            {callState === 'speaking' && (
              <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping scale-150" />
            )}
            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-xl transition-all duration-300 ${
              callState === 'listening' ? 'bg-green-600' :
              callState === 'speaking'  ? 'bg-blue-600' :
              callState === 'thinking'  ? 'bg-yellow-500' :
              callState === 'error'     ? 'bg-red-600' :
              'bg-gray-600'
            }`}>
              🤖
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="text-center px-4 pb-2">
          <div className="flex items-center justify-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stateColor[callState]}`} />
            <span className="text-sm font-medium text-gray-300">{stateLabel[callState]}</span>
          </div>
        </div>

        {/* Transcript / AI text */}
        <div className="mx-4 mb-4 bg-gray-800 rounded-2xl p-4 min-h-[80px] max-h-[120px] overflow-y-auto">
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : callState === 'listening' && transcript ? (
            <p className="text-sm text-green-300 italic">"{transcript}"</p>
          ) : callState === 'listening' ? (
            <p className="text-sm text-gray-500 text-center mt-2">🎤 Pode falar...</p>
          ) : aiText ? (
            <p className="text-sm text-gray-200 leading-relaxed">{stripMarkdown(aiText).slice(0, 250)}{stripMarkdown(aiText).length > 250 ? '...' : ''}</p>
          ) : null}
        </div>

        {/* Conversation mini-log */}
        {turns.length > 1 && (
          <div className="mx-4 mb-3 space-y-1 max-h-24 overflow-y-auto">
            {turns.slice(-4).map((t, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded-xl ${t.role === 'user' ? 'bg-gray-700 text-gray-300 text-right' : 'bg-gray-800 text-blue-300'}`}>
                {t.role === 'user' ? '🎤 ' : '🤖 '}{t.text.slice(0, 80)}{t.text.length > 80 ? '…' : ''}
              </div>
            ))}
          </div>
        )}

        {/* Hint */}
        <div className="text-center px-4 mb-4">
          <p className="text-xs text-gray-500">
            {callState === 'listening'
              ? 'Fale normalmente. Diga "tchau" para encerrar.'
              : callState === 'speaking'
              ? 'Aguarde a IA terminar...'
              : 'Diga "tchau" ou clique em encerrar para sair.'}
          </p>
        </div>

        {/* End call button */}
        <div className="flex justify-center pb-8">
          <button
            onClick={handleClose}
            className="w-16 h-16 bg-red-600 hover:bg-red-700 active:scale-95 transition-all rounded-full flex items-center justify-center shadow-lg"
            title="Encerrar chamada"
          >
            <PhoneXMarkIcon className="w-8 h-8 text-white" />
          </button>
        </div>

      </div>
    </div>
  )
}
