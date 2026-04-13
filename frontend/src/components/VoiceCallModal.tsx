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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSpeechRecognition(): any | null {
  const SpeechRec =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRec) return null
  const rec = new SpeechRec()
  rec.lang = 'pt-BR'
  rec.continuous = false
  rec.interimResults = false
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

/** Speak using neural TTS via backend; falls back to browser SpeechSynthesis */
async function speakNeural(text: string, onEnd: () => void, audioRef: React.MutableRefObject<HTMLAudioElement | null>): Promise<void> {
  const clean = stripMarkdown(text).slice(0, 700)

  // Stop any current playback
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current.src = ''
    audioRef.current = null
  }
  window.speechSynthesis.cancel()

  // Try ElevenLabs directly from browser (free tier works with residential IPs)
  const elevenKey = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY
  if (elevenKey) {
    try {
      const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Sarah - multilingual natural pt-BR
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
      console.log('[TTS] ElevenLabs status:', res.status)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; onEnd() }
        audio.onerror = (e) => { console.error('[TTS] audio error', e); URL.revokeObjectURL(url); audioRef.current = null; onEnd() }
        await audio.play()
        return
      }
      const errBody = await res.text().catch(() => '')
      console.error('[TTS] ElevenLabs error:', res.status, errBody)
    } catch (e) {
      console.error('[TTS] ElevenLabs fetch error:', e)
    }
  }

  // Try Google TTS via backend
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
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; onEnd() }
      audio.onerror = (e) => { console.error('[TTS] audio error', e); URL.revokeObjectURL(url); audioRef.current = null; onEnd() }
      await audio.play()
      return
    }
    console.error('[TTS] backend error:', res.status)
  } catch (e) {
    console.error('[TTS] backend fetch error:', e)
  }

  // Browser fallback
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
    if (closingRef.current) return
    const rec = getSpeechRecognition()
    if (!rec) {
      setError('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      setCallState('error')
      return
    }
    recRef.current = rec
    setCallState('listening')
    setTranscript('')

    rec.onresult = async (event) => {
      const said = event.results[0]?.[0]?.transcript?.trim() || ''
      if (!said) { startListening(); return }

      setTranscript(said)
      setCallState('thinking')

      // Detect hangup intent
      const lower = said.toLowerCase()
      if (['tchau', 'encerrar', 'desligar', 'finalizar', 'até mais'].some(w => lower.includes(w))) {
        const bye = `Até logo, ${loggedUserName.split(' ')[0]}! Qualquer coisa pode abrir a chamada novamente.`
        setAiText(bye)
        setCallState('speaking')
        speakNeural(bye, () => { if (!closingRef.current) onClose() }, audioRef)
        return
      }

      // Add to history
      historyRef.current.push({ role: 'user', content: said })
      if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20)

      setTurns(prev => [...prev, { role: 'user', text: said }])

      try {
          const voicePrompt = systemPrompt + `\n\n## MODO VOZ ATIVA\nVocê está em uma conversa de VOZ agora. Regras OBRIGATÓRIAS:\n- Respostas CURTAS: máximo 2-3 frases. Nunca use listas ou tabelas.\n- NUNCA diga "Sou a assistente do CRM" ou se apresente novamente — já se apresentou.\n- Fale como colega de trabalho, natural e direto. Sem formalidade.\n- Números: fale por extenso ("mil quatrocentos" não "1400").\n- Se precisar de mais detalhes, faça UMA pergunta só.`
        const reply = await callAIVoice(historyRef.current, voicePrompt)

        historyRef.current.push({ role: 'assistant', content: reply })
        setTurns(prev => [...prev, { role: 'assistant', text: reply }])
        setAiText(reply)
        setCallState('speaking')

        speakNeural(reply, () => {
          if (!closingRef.current) startListening()
        }, audioRef)
      } catch {
        const errMsg = 'Ocorreu um erro. Pode repetir?'
        setAiText(errMsg)
        setCallState('speaking')
        speakNeural(errMsg, () => { if (!closingRef.current) startListening() }, audioRef)
      }
    }

    rec.onerror = (event) => {
      if (closingRef.current) return
      if (event.error === 'no-speech') {
        // User didn't say anything — just restart
        startListening()
      } else if (event.error === 'not-allowed') {
        setError('Permissão do microfone negada. Habilite nas configurações do navegador.')
        setCallState('error')
      } else {
        // Restart on other errors
        setTimeout(() => { if (!closingRef.current) startListening() }, 500)
      }
    }

    rec.onend = () => {
      // If still in 'listening' state and didn't get result, restart
      // (handles cases where recognition ended without result or error)
    }

    rec.start()
  }, [systemPrompt, loggedUserName, onClose])

  // ── Greet on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
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
