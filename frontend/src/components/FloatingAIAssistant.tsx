import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  SparklesIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  MicrophoneIcon,
  StopIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'
import { callAI } from '../lib/gemini'
import type { AIMessage } from '../lib/gemini'
import { MANIFESTO_COMERCIAL_OKEYLAC, REGRAS_MF_PARIS, TEXTO_CATALOGO } from '../data/aiContext'
import type { Vendedor, Produto } from '../types'

type Mode = 'chat' | 'meeting'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface MeetingSuggestion {
  text: string
  ts: number
  type: 'tip' | 'objection' | 'question' | 'closing'
}

const SYSTEM_PROMPT = `Você é o Assistente Comercial IA da MF Paris / Okeylac — distribuidora de ingredientes lácteos industriais.
Seu papel é ajudar vendedores em tempo real com:
1. Correção e melhoria de mensagens e emails para clientes
2. Sugestões de argumentos e respostas para objeções
3. Informações sobre produtos, preços e condições
4. Dicas de técnica de vendas
5. Qualquer dúvida sobre o processo comercial

CATÁLOGO:
${TEXTO_CATALOGO}

MANIFESTO COMERCIAL:
${MANIFESTO_COMERCIAL_OKEYLAC}

REGRAS COMERCIAIS:
${REGRAS_MF_PARIS}

REGRAS DE RESPOSTA:
- Seja DIRETO e CONCISO — o vendedor está no meio de uma negociação
- Máximo 3-4 linhas por resposta, a menos que peçam algo mais detalhado
- Se pedirem para corrigir/melhorar uma mensagem, devolva APENAS a mensagem corrigida, sem explicação
- Use formatação simples, sem markdown pesado
- Fale como um colega consultor, não como robô`

const MEETING_SYSTEM = `Você é um coach de vendas em tempo real da MF Paris / Okeylac. Está ouvindo uma reunião/call entre um vendedor e um cliente.

CATÁLOGO:
${TEXTO_CATALOGO}

REGRAS COMERCIAIS (resumo):
- Nunca defender preço, defender resultado
- Perguntas valem mais que argumentos  
- O vendedor deve parecer consultor, não vendedor de caixas
- Nunca negociar imediatamente, entender primeiro
- Desconto autônomo: apenas 2% à vista
- Pedido mínimo: 200kg (MG), 300kg (outros estados)

Baseado no trecho de conversa transcrito, dê UMA sugestão curta e prática (máx 2 linhas) ao vendedor. Classifique como: [TIP], [OBJEÇÃO], [PERGUNTA] ou [FECHAMENTO].
Formato: [TIPO] Sugestão aqui.
Se não tiver nada útil para sugerir, responda apenas "—".`

export default function FloatingAIAssistant({ vendedor, produtos }: { vendedor: Vendedor; produtos: Produto[] }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('chat')

  // Chat state
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<number | null>(null)

  // Meeting state
  const [isListening, setIsListening] = useState(false)
  const isListeningRef = useRef(false)
  const [meetingTranscript, setMeetingTranscript] = useState('')
  const [suggestions, setSuggestions] = useState<MeetingSuggestion[]>([])
  const [meetingDuration, setMeetingDuration] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const recognitionRef = useRef<any>(null)
  const meetingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const meetingStartRef = useRef(0)
  const transcriptBufferRef = useRef('')
  const transcriptContextRef = useRef('')
  const analyzingRef = useRef(false)
  const analyzingSinceRef = useRef(0)
  const lastAnalysisErrorRef = useRef(0)
  const analyzeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs])

  useEffect(() => {
    if (open && mode === 'chat') setTimeout(() => inputRef.current?.focus(), 100)
  }, [open, mode])

  useEffect(() => {
    return () => {
      isListeningRef.current = false
      if (meetingTimerRef.current) clearInterval(meetingTimerRef.current)
      if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current)
      if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    }
  }, [])

  const sendMsg = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    const newMsg: Msg = { role: 'user', content: text, ts: Date.now() }
    const newMsgs = [...msgs, newMsg]
    setMsgs(newMsgs)
    setLoading(true)

    try {
      const histAI: AIMessage[] = newMsgs.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const resp = await callAI(histAI, SYSTEM_PROMPT)
      setMsgs(prev => [...prev, { role: 'assistant', content: resp, ts: Date.now() }])
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Erro de conexão. Tente novamente.', ts: Date.now() }])
    }
    setLoading(false)
  }

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  // Meeting mode — Speech Recognition
  const stopMeeting = useCallback(() => {
    isListeningRef.current = false
    setIsListening(false)
    setAnalyzing(false)
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    if (meetingTimerRef.current) { clearInterval(meetingTimerRef.current); meetingTimerRef.current = null }
    if (analyzeTimerRef.current) { clearInterval(analyzeTimerRef.current); analyzeTimerRef.current = null }
    recognitionRef.current = null
  }, [])

  const analyzeChunk = useCallback(async () => {
    if (analyzingRef.current || !isListeningRef.current) return
    const buffer = transcriptBufferRef.current.trim()
    if (!buffer || buffer.length < 20) return
    transcriptBufferRef.current = ''
    analyzingRef.current = true
    analyzingSinceRef.current = Date.now()
    setAnalyzing(true)
    const contexto = transcriptContextRef.current.slice(-600)

    try {
      const resp = await Promise.race([
        callAI(
          [{ role: 'user', content: `${contexto ? `Contexto anterior da conversa:\n"${contexto}"\n\n` : ''}Trecho da conversa ouvida agora:\n"${buffer}"` }],
          MEETING_SYSTEM
        ),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
      ])
      transcriptContextRef.current = `${contexto} ${buffer}`.slice(-1200)
      if (resp.trim() && resp.trim() !== '—') {
        const typeMatch = resp.match(/\[(TIP|OBJEÇÃO|PERGUNTA|FECHAMENTO)\]/i)
        const rawType = typeMatch ? typeMatch[1].toLowerCase() : ''
        const text = resp.replace(/\[(TIP|OBJEÇÃO|PERGUNTA|FECHAMENTO)\]/gi, '').trim()
        const mappedType: MeetingSuggestion['type'] = rawType.includes('obje') ? 'objection' : rawType.includes('pergu') ? 'question' : rawType.includes('fecha') ? 'closing' : 'tip'
        setSuggestions(prev => [{ text, ts: Date.now(), type: mappedType } as MeetingSuggestion, ...prev].slice(0, 20))
      }
    } catch {
      transcriptBufferRef.current = `${buffer} ${transcriptBufferRef.current}`
      const now = Date.now()
      if (now - lastAnalysisErrorRef.current > 60000) {
        lastAnalysisErrorRef.current = now
        setSuggestions(prev => [{ text: '⚠️ Falha ao gerar sugestão — verifique a conexão. A escuta continua.', ts: now, type: 'tip' as MeetingSuggestion['type'] }, ...prev].slice(0, 20))
      }
    } finally {
      analyzingRef.current = false
      setAnalyzing(false)
    }
  }, [])

  const startMeeting = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSuggestions([{ text: 'Seu navegador não suporta reconhecimento de voz. Use o Chrome.', ts: Date.now(), type: 'tip' }])
      return
    }

    transcriptBufferRef.current = ''
    transcriptContextRef.current = ''
    lastAnalysisErrorRef.current = 0
    setMeetingTranscript('')
    setSuggestions([])

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'pt-BR'

    recognition.onresult = (event: any) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + ' '
        }
      }
      if (finalText.trim()) {
        transcriptBufferRef.current += finalText
        setMeetingTranscript(prev => prev + finalText)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setSuggestions([{ text: 'Permissão de microfone negada. Habilite nas configurações do navegador.', ts: Date.now(), type: 'tip' }])
        stopMeeting()
        return
      }
      if (event.error === 'audio-capture') {
        setSuggestions(prev => [{ text: 'Nenhum microfone encontrado. Verifique o dispositivo de áudio.', ts: Date.now(), type: 'tip' as MeetingSuggestion['type'] }, ...prev])
        stopMeeting()
      }
      // Erros transitórios ('no-speech', 'network', 'aborted') — onend reinicia a escuta
    }

    recognition.onend = () => {
      // Auto-restart while meeting is active
      if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    isListeningRef.current = true
    try {
      recognition.start()
    } catch {
      stopMeeting()
      return
    }
    setIsListening(true)
    meetingStartRef.current = Date.now()
    setMeetingDuration(0)
    meetingTimerRef.current = setInterval(() => {
      setMeetingDuration(Math.floor((Date.now() - meetingStartRef.current) / 1000))
    }, 1000)

    // Analyze transcript every 12 seconds — com watchdog: se uma análise
    // ficar pendurada >45s (chamada de IA sem resposta), destrava o flag
    // para não silenciar as sugestões pelo resto da reunião
    analyzeTimerRef.current = setInterval(() => {
      if (analyzingRef.current && Date.now() - analyzingSinceRef.current > 45000) {
        analyzingRef.current = false
        setAnalyzing(false)
      }
      analyzeChunk()
    }, 12000)
  }, [analyzeChunk, stopMeeting])

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const suggestionIcon = (type: MeetingSuggestion['type']) => {
    switch (type) {
      case 'tip': return '💡'
      case 'objection': return '🛡️'
      case 'question': return '❓'
      case 'closing': return '🤝'
    }
  }
  const suggestionColor = (type: MeetingSuggestion['type']) => {
    switch (type) {
      case 'tip': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      case 'objection': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
      case 'question': return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
      case 'closing': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-24 md:right-6 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 group"
        title="Assistente IA"
      >
        <SparklesIcon className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 right-4 md:bottom-24 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-[380px] max-h-[70vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-700 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5" />
          <span className="font-semibold text-sm">Assistente IA</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <button onClick={() => setMode('chat')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${mode === 'chat' ? 'bg-white/20' : 'hover:bg-white/10'}`}>
            <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 inline mr-1" />Chat
          </button>
          <button onClick={() => setMode('meeting')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${mode === 'meeting' ? 'bg-white/20' : 'hover:bg-white/10'}`}>
            <SignalIcon className="h-3.5 w-3.5 inline mr-1" />Reunião
          </button>
          <button onClick={() => { setOpen(false); stopMeeting() }} className="p-1 hover:bg-white/20 rounded-lg ml-1">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Chat Mode */}
      {mode === 'chat' && (
        <>
          <div ref={chatRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[50vh]">
            {msgs.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <SparklesIcon className="h-8 w-8 text-purple-300 mx-auto" />
                <p className="text-xs text-gray-400">Como posso te ajudar?</p>
                <div className="space-y-1.5">
                  {[
                    '✏️ Corrigir uma mensagem para cliente',
                    '📧 Escrever um email de follow-up',
                    '🛡️ Responder objeção de preço',
                    '📦 Info sobre produto do catálogo',
                  ].map((s, i) => (
                    <button key={i} onClick={() => { setInput(s.slice(2).trim()); setTimeout(() => inputRef.current?.focus(), 50) }}
                      className="block w-full text-left px-3 py-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm relative group ${m.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && (
                    <button onClick={() => copyToClipboard(m.content, i)}
                      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 p-1 bg-white dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600 transition-opacity"
                      title="Copiar">
                      {copied === i ? <CheckIcon className="h-3 w-3 text-green-500" /> : <ClipboardDocumentIcon className="h-3 w-3 text-gray-400" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2 flex items-center gap-1.5">
                  {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-2 flex gap-2 flex-shrink-0">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMsg()}
              disabled={loading} placeholder="Pergunte ou cole uma mensagem..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-50" />
            <button onClick={sendMsg} disabled={loading || !input.trim()}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-40 transition-colors">
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {/* Meeting Mode */}
      {mode === 'meeting' && (
        <div className="flex-1 flex flex-col min-h-[300px] max-h-[50vh]">
          {/* Meeting controls */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 text-center space-y-3">
            {!isListening ? (
              <>
                <p className="text-xs text-gray-500">Ative o microfone durante uma reunião ou call. A IA vai ouvir e dar sugestões em tempo real.</p>
                <p className="text-[10px] text-gray-400">Dica: em ligações, deixe o celular no viva-voz para a IA ouvir o cliente também.</p>
                <button onClick={startMeeting}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 mx-auto shadow-lg shadow-green-500/20">
                  <MicrophoneIcon className="h-5 w-5" />Iniciar Escuta
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-mono font-bold text-gray-800 dark:text-gray-200">{fmt(meetingDuration)}</span>
                  <span className="text-xs text-gray-400">Ouvindo...</span>
                  {analyzing && <span className="text-[10px] text-violet-500 animate-pulse font-medium">analisando…</span>}
                </div>
                {/* Mini waveform */}
                <div className="flex items-center justify-center gap-0.5 h-6">
                  {[...Array(15)].map((_, i) => (
                    <div key={i} className="w-0.5 rounded-full bg-green-500 transition-all duration-150"
                      style={{ height: `${4 + Math.random() * 18}px` }} />
                  ))}
                </div>
                <button onClick={stopMeeting}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 mx-auto">
                  <StopIcon className="h-4 w-4" />Parar
                </button>
              </div>
            )}
          </div>

          {/* Suggestions feed */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {suggestions.length === 0 && (
              <div className="text-center py-8">
                <SignalIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">{isListening ? 'Aguardando conversa para analisar...' : 'Sugestões aparecerão aqui durante a reunião'}</p>
              </div>
            )}
            {suggestions.map((s, i) => (
              <div key={i} className={`p-3 rounded-lg border text-sm ${suggestionColor(s.type)}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base flex-shrink-0">{suggestionIcon(s.type)}</span>
                  <p className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed">{s.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Transcript preview (collapsed) */}
          {meetingTranscript && (
            <details className="border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <summary className="px-3 py-2 text-[10px] font-medium text-gray-400 cursor-pointer hover:text-gray-600">
                Ver transcrição ({meetingTranscript.split(' ').length} palavras)
              </summary>
              <div className="px-3 pb-2 max-h-24 overflow-y-auto">
                <p className="text-[11px] text-gray-500 leading-relaxed">{meetingTranscript}</p>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
