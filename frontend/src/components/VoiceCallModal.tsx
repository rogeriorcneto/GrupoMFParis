/**
 * VoiceCallModal — Chamada de voz para a IA do CRM
 *
 * Usa Web Speech API (nativa no Chrome/Edge):
 *  - SpeechRecognition: converte voz → texto
 *  - SpeechSynthesis: fala as respostas da IA (voz pt-BR)
 *  - callAIFull: envia para Gemini com contexto completo do CRM
 */
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { PhoneXMarkIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/solid'
import { callAIFull } from '../lib/gemini'
import type { AIMessage } from '../lib/gemini'

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

function speak(text: string, onEnd: () => void): SpeechSynthesisUtterance {
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(stripMarkdown(text).slice(0, 500))
  utter.lang = 'pt-BR'
  utter.rate = 1.05
  utter.pitch = 1.0

  // Prefer a pt-BR voice if available
  const voices = window.speechSynthesis.getVoices()
  const ptVoice =
    voices.find(v => v.lang === 'pt-BR' && v.name.toLowerCase().includes('google')) ||
    voices.find(v => v.lang === 'pt-BR') ||
    voices.find(v => v.lang.startsWith('pt'))
  if (ptVoice) utter.voice = ptVoice

  utter.onend = onEnd
  utter.onerror = onEnd
  window.speechSynthesis.speak(utter)
  return utter
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
        speak(bye, () => { if (!closingRef.current) onClose() })
        return
      }

      // Add to history
      historyRef.current.push({ role: 'user', content: said })
      if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20)

      setTurns(prev => [...prev, { role: 'user', text: said }])

      try {
        const result = await callAIFull(historyRef.current, systemPrompt)
        const reply = result.response || 'Entendido.'

        historyRef.current.push({ role: 'assistant', content: reply })
        setTurns(prev => [...prev, { role: 'assistant', text: reply }])
        setAiText(reply)
        setCallState('speaking')

        speak(reply, () => {
          if (!closingRef.current) startListening()
        })
      } catch {
        const errMsg = 'Ocorreu um erro. Pode repetir?'
        setAiText(errMsg)
        setCallState('speaking')
        speak(errMsg, () => { if (!closingRef.current) startListening() })
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
    const greeting = `Olá ${loggedUserName.split(' ')[0]}! Sou a assistente do CRM. Como posso ajudar?`
    setAiText(greeting)
    setCallState('speaking')
    historyRef.current.push({ role: 'assistant', content: greeting })
    setTurns([{ role: 'assistant', text: greeting }])

    // Wait for voices to load (Chrome loads them async)
    const doGreet = () => speak(greeting, () => { if (!closingRef.current) startListening() })
    if (window.speechSynthesis.getVoices().length > 0) {
      doGreet()
    } else {
      window.speechSynthesis.onvoiceschanged = () => { doGreet(); window.speechSynthesis.onvoiceschanged = null }
      // Fallback if onvoiceschanged never fires
      setTimeout(doGreet, 400)
    }
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
