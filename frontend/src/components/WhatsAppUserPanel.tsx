import React, { useState, useEffect, useRef, useCallback } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ArrowPathIcon, QrCodeIcon, PhoneIcon, MicrophoneIcon, StopIcon, TrashIcon, PhotoIcon, MagnifyingGlassIcon, UserGroupIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import type { Cliente, Vendedor } from '../types'
import {
  getUserWhatsAppStatus, getUserWhatsAppQR,
  connectUserWhatsApp, disconnectUserWhatsApp,
  sendUserWhatsApp, fetchWhatsAppMessages, fetchWhatsAppChatMessages,
  queryWhatsAppAI, getUserWhatsAppContacts,
  sendUserWhatsAppAudio, sendUserWhatsAppImage,
  validateWhatsAppContacts, suggestSalesMessage,
  type UserWAStatus, type WAContactItem,
} from '../lib/botApi'
import CallRecorder, { type CallMode } from './CallRecorder'
import { formatBrazilianPhone } from '../utils/validators'

interface WhatsAppUserPanelProps {
  loggedUser: Vendedor | null
  cliente?: Cliente | null
  onClose?: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
  compact?: boolean
}

interface Message {
  id: number
  text: string
  from: 'me' | 'them' | 'system'
  time: string
}

const WhatsAppUserPanel: React.FC<WhatsAppUserPanelProps> = ({
  loggedUser, cliente, onClose, showToast, compact = false,
}) => {
  const [waStatus, setWaStatus] = useState<UserWAStatus>({
    connected: false, status: 'disconnected', number: null, uptime: 0, vendedorId: 0,
  })
  const [qrData, setQrData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [botOnline, setBotOnline] = useState(false)

  // Chat state (when connected + cliente selected)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatText, setChatText] = useState('')
  const [sending, setSending] = useState(false)
  const [suggestingText, setSuggestingText] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiHistory, setAiHistory] = useState<{ role: string; content: string }[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Call & voice recorder state
  const [showCallRecorder, setShowCallRecorder] = useState(false)
  const [callMode, setCallMode] = useState<CallMode>('phone')
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const voiceBlobRef = useRef<Blob | null>(null)

  // Contacts sidebar state
  const [showContacts, setShowContacts] = useState(false)
  const [waContacts, setWaContacts] = useState<WAContactItem[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<WAContactItem | null>(null)

  // Image attachment
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Validation state
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ total: number; valid: number; invalid: number; errors: number } | null>(null)

  // Estado local de "aguardando QR" — persiste independente do status do backend
  const [waitingForQR, setWaitingForQR] = useState(false)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 3
  const connectStartRef = useRef(0)
  const QR_TIMEOUT = 30_000 // 30s para gerar QR

  // Poll status + QR
  const fetchStatus = useCallback(async () => {
    try {
      const status = await getUserWhatsAppStatus()
      setWaStatus(status)
      setBotOnline(true)

      if (status.status === 'qr' || status.status === 'connecting') {
        const qrRes = await getUserWhatsAppQR()
        setQrData(qrRes.qr)
        if (qrRes.qr) {
          setWaitingForQR(false)
          setError(null)
        }
      } else if (status.connected) {
        setQrData(null)
        setWaitingForQR(false)
        setError(null)
        retryCountRef.current = 0
      } else {
        setQrData(null)
      }

      // Se estava esperando QR e o backend voltou a 'disconnected', apenas checar timeout
      // NÃO chamar connectUserWhatsApp() de novo — o backend faz reconexão interna
      if (waitingForQR && status.status === 'disconnected') {
        if (Date.now() - connectStartRef.current > QR_TIMEOUT) {
          setWaitingForQR(false)
          setError('Não foi possível gerar o QR Code. Verifique se o backend está online e tente novamente.')
        }
        // Caso contrário, aguardar — o backend pode estar reconectando
      }

      // Salvar token para o beforeunload poder desconectar ao fechar página
      if (status.connected) {
        try {
          const { supabase } = await import('../lib/supabase')
          const { data } = await supabase.auth.getSession()
          if (data.session?.access_token) {
            sessionStorage.setItem('wa_auth_token', data.session.access_token)
          }
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      if (err?.message === 'AUTH_EXPIRED') {
        setError('Sessão expirada. Faça login novamente.')
        setWaitingForQR(false)
        if (pollRef.current) clearInterval(pollRef.current)
        return
      }
      setError(err?.message || 'Não foi possível consultar o WhatsApp.')
      setBotOnline(false)
    }
  }, [waitingForQR])

  // Função de conectar (usada pelo auto-connect e pelo botão)
  const startConnect = useCallback(async () => {
    setLoading(true)
    setError(null)
    setWaitingForQR(true)
    retryCountRef.current = 0
    connectStartRef.current = Date.now()
    try {
      const result = await connectUserWhatsApp()
      if (!result.success) {
        setError(result.error || 'Erro ao conectar')
        setWaitingForQR(false)
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao conectar')
      setWaitingForQR(false)
    }
    setLoading(false)
  }, [])

  // Auto-connect on mount
  const autoConnectRef = useRef(false)
  useEffect(() => {
    const init = async () => {
      try {
        const status = await getUserWhatsAppStatus()
        setWaStatus(status)
        setBotOnline(true)
        if (status.connected) return // Já conectado, não precisa fazer nada
        if (status.status === 'qr' || status.status === 'connecting') {
          // Já está gerando QR, só buscar
          const qrRes = await getUserWhatsAppQR()
          setQrData(qrRes.qr)
          return
        }
        // Desconectado — auto-conectar
        if (!autoConnectRef.current) {
          autoConnectRef.current = true
          await startConnect()
        }
      } catch (err: any) {
        setError(err?.message || 'Não foi possível iniciar o WhatsApp.')
        setBotOnline(false)
      }
    }
    init()
    pollRef.current = setInterval(fetchStatus, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchStatus, startConnect])

  // Load contacts when connected
  const loadContacts = useCallback(async () => {
    if (!waStatus.connected) return
    setContactsLoading(true)
    try {
      const contacts = await getUserWhatsAppContacts()
      setWaContacts(contacts)
    } catch { /* ignore */ }
    setContactsLoading(false)
  }, [waStatus.connected])

  useEffect(() => {
    if (waStatus.connected) loadContacts()
  }, [waStatus.connected, loadContacts])

  // Fast polling (3s) for first 60s after connect to progressively show contacts
  useEffect(() => {
    if (!waStatus.connected) return
    const connectTime = Date.now()
    let cancelled = false
    let slowIv: ReturnType<typeof setInterval> | null = null

    const fastPoll = () => {
      if (cancelled) return
      loadContacts()
      if (Date.now() - connectTime < 60_000) {
        setTimeout(fastPoll, 3_000)
      } else if (showContacts) {
        slowIv = setInterval(loadContacts, 15_000)
      }
    }
    setTimeout(fastPoll, 3_000)

    return () => { cancelled = true; if (slowIv) clearInterval(slowIv) }
  }, [waStatus.connected, showContacts, loadContacts])

  // Determine current chat target number
  const getChatNumber = useCallback((): string => {
    if (cliente) {
      return (cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone || '').replace(/\D/g, '')
    }
    if (selectedContact) return selectedContact.number
    return ''
  }, [cliente, selectedContact])

  const getChatName = useCallback((): string => {
    if (cliente) return cliente.contatoNome || cliente.razaoSocial
    if (selectedContact) return selectedContact.name || selectedContact.notify || selectedContact.number
    return ''
  }, [cliente, selectedContact])

  const hasChatTarget = !!(cliente || selectedContact)

  // Load chat history when connected + (cliente or selectedContact)
  // Strategy: try in-memory Baileys cache first (has synced history), fall back to DB
  useEffect(() => {
    if (!waStatus.connected) return
    if (!cliente?.id && !selectedContact) return
    setChatLoading(true)

    const chatNumber = selectedContact?.number || (cliente?.whatsapp || cliente?.contatoCelular || cliente?.contatoTelefone || '').replace(/\D/g, '')

    // 1. Try in-memory cache (Baileys synced messages)
    const tryCache = chatNumber
      ? fetchWhatsAppChatMessages({ numero: chatNumber, limit: 100 })
      : Promise.resolve([])

    tryCache.then(cachedMsgs => {
      if (cachedMsgs && cachedMsgs.length > 0) {
        setMessages(cachedMsgs.map((m: any) => ({
          id: m.id || Date.now(),
          text: m.text,
          from: m.fromMe ? 'me' as const : 'them' as const,
          time: m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        })))
        setChatLoading(false)
        return
      }
      // 2. Fall back to DB messages
      const dbPromise = cliente?.id
        ? fetchWhatsAppMessages({ clienteId: cliente.id, limit: 100 })
        : chatNumber
          ? fetchWhatsAppMessages({ numero: chatNumber, limit: 100 })
          : Promise.resolve([])

      dbPromise.then(dbMsgs => {
        setMessages((dbMsgs || []).map((m: any) => ({
          id: m.id || Date.now(),
          text: m.mensagem,
          from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
          time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        })))
      }).catch(() => {}).finally(() => setChatLoading(false))
    }).catch(() => {
      setChatLoading(false)
    })
  }, [waStatus.connected, cliente?.id, selectedContact])

  // Poll WA messages every 5s when chat is open
  useEffect(() => {
    if (!waStatus.connected) return
    if (!cliente?.id && !selectedContact) return
    const chatNumber = selectedContact?.number || (cliente?.whatsapp || cliente?.contatoCelular || cliente?.contatoTelefone || '').replace(/\D/g, '')
    if (!chatNumber) return
    const iv = setInterval(() => {
      fetchWhatsAppChatMessages({ numero: chatNumber, limit: 100 }).then(cached => {
        if (cached && cached.length > 0) {
          const incoming = cached.map((m: any) => ({
            id: m.id || Date.now(),
            text: m.text,
            from: m.fromMe ? 'me' as const : 'them' as const,
            time: m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
          }))
          setMessages(prev => {
            const seen = new Set(prev.map(m => String(m.id)))
            const merged = [...prev]
            for (const m of incoming) {
              if (!seen.has(String(m.id))) {
                seen.add(String(m.id))
                merged.push(m)
              }
            }
            return merged
          })
        } else {
          const dbPromise = cliente?.id
            ? fetchWhatsAppMessages({ clienteId: cliente.id, limit: 100 })
            : fetchWhatsAppMessages({ numero: chatNumber, limit: 100 })
          dbPromise.then(dbMsgs => {
            if (dbMsgs && dbMsgs.length > 0) {
              const incoming = (dbMsgs || []).map((m: any) => ({
                id: m.id || Date.now(),
                text: m.mensagem,
                from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
                time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
              }))
              setMessages(prev => {
                const seen = new Set(prev.map(m => String(m.id)))
                const merged = [...prev]
                for (const m of incoming) {
                  if (!seen.has(String(m.id))) {
                    seen.add(String(m.id))
                    merged.push(m)
                  }
                }
                return merged
              })
            }
          }).catch(() => {})
        }
      }).catch(() => {})
    }, 5_000)
    return () => clearInterval(iv)
  }, [waStatus.connected, cliente?.id, selectedContact])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle image send
  const handleImageSend = useCallback(async (file: File) => {
    const num = getChatNumber()
    if (!num) { showToast?.('error', 'Sem número para enviar.'); return }
    setSending(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1]) // strip data:...;base64,
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [...prev, { id: Date.now(), text: `📷 [Imagem] ${file.name}`, from: 'me', time: now }])
      const result = await sendUserWhatsAppImage(num, base64, file.type, undefined, cliente?.id)
      if (!result.success) {
        showToast?.('error', 'Falha ao enviar imagem: ' + (result.error || ''))
      } else {
        showToast?.('success', 'Imagem enviada!')
      }
    } catch (err: any) {
      showToast?.('error', 'Erro ao processar imagem: ' + (err?.message || ''))
    }
    setSending(false)
  }, [getChatNumber, cliente?.id, showToast])

  const handleConnect = async () => {
    await startConnect()
  }

  const handleDisconnect = async () => {
    setLoading(true)
    const result = await disconnectUserWhatsApp()
    if (!result.success) setError(result.error || 'Erro ao desconectar')
    else { setQrData(null); setMessages([]); setWaitingForQR(false) }
    setLoading(false)
  }

  const handleSend = async () => {
    if (!chatText.trim()) return
    const msg = chatText.trim()

    // Check if it's an AI command: /ia <pergunta>
    const isAiCommand = msg.toLowerCase().startsWith('/ia ') || aiMode
    const aiQuestion = msg.toLowerCase().startsWith('/ia ') ? msg.slice(4).trim() : msg

    if (isAiCommand && aiQuestion) {
      setChatText('')
      setSending(true)

      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [...prev, {
        id: Date.now(), text: `🤖 ${aiQuestion}`, from: 'me', time: now,
      }])

      const newHistory = [...aiHistory, { role: 'user', content: aiQuestion }]
      const result = await queryWhatsAppAI(aiQuestion, aiHistory)

      if (result.success && result.reply) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, text: result.reply!, from: 'system',
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }])
        newHistory.push({ role: 'assistant', content: result.reply })
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, text: '❌ ' + (result.error || 'Erro na IA'), from: 'system',
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }])
      }
      setAiHistory(newHistory.slice(-20))
      setSending(false)
      return
    }

    const chatNum = getChatNumber()
    if (!chatNum) {
      showToast?.('error', 'Selecione um contato para enviar mensagem.')
      return
    }

    setChatText('')
    setSending(true)

    setMessages(prev => [...prev, {
      id: Date.now(), text: msg, from: 'me',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }])

    const result = await sendUserWhatsApp(chatNum, msg, cliente?.id)
    if (!result.success) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, text: '❌ Falha: ' + (result.error || 'Erro'), from: 'system',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }])
      showToast?.('error', 'Falha ao enviar: ' + (result.error || ''))
    } else {
      showToast?.('success', 'Mensagem enviada!')
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSuggestText = async () => {
    const targetName = getChatName()
    setSuggestingText(true)
    const result = await suggestSalesMessage({
      canal: 'whatsapp',
      text: chatText,
      instruction: 'Reescreva para WhatsApp comercial com linguagem executiva de vendas, mantendo objetividade e CTA claro.',
      clienteNome: targetName,
      empresaNome: cliente?.razaoSocial,
      vendedorNome: loggedUser?.nome,
    })

    if (result.success && result.suggestion) {
      setChatText(result.suggestion.trim())
      showToast?.('success', 'Sugestão de texto aplicada pela IA.')
    } else {
      showToast?.('error', result.error || 'Não foi possível gerar sugestão com IA.')
    }
    setSuggestingText(false)
  }

  // ── Voice message recorder ──
  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      voiceStreamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      voiceRecorderRef.current = recorder
      voiceChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: mimeType })
        voiceBlobRef.current = blob
        setVoiceAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
        voiceStreamRef.current = null
      }
      recorder.start(500)
      setIsRecordingVoice(true)
      setVoiceSeconds(0)
      voiceTimerRef.current = setInterval(() => setVoiceSeconds(s => s + 1), 1000)
    } catch {
      showToast?.('error', 'Não foi possível acessar o microfone.')
    }
  }, [showToast])

  const stopVoiceRecording = useCallback(() => {
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null }
    if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') voiceRecorderRef.current.stop()
    setIsRecordingVoice(false)
  }, [])

  const cancelVoiceRecording = useCallback(() => {
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null }
    if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') voiceRecorderRef.current.stop()
    if (voiceStreamRef.current) { voiceStreamRef.current.getTracks().forEach(t => t.stop()); voiceStreamRef.current = null }
    voiceBlobRef.current = null
    if (voiceAudioUrl) URL.revokeObjectURL(voiceAudioUrl)
    setVoiceAudioUrl(null)
    setIsRecordingVoice(false)
    setVoiceSeconds(0)
  }, [voiceAudioUrl])

  const sendVoiceMessage = useCallback(async () => {
    if (!voiceBlobRef.current) return
    const chatNum = getChatNumber()
    if (!chatNum) { showToast?.('error', 'Selecione um contato para enviar.'); return }
    setSending(true)
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const durationLabel = `${Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:${(voiceSeconds % 60).toString().padStart(2, '0')}`
    setMessages(prev => [...prev, { id: Date.now(), text: `🎙️ Áudio (${durationLabel})`, from: 'me', time: now }])
    try {
      // Convert blob to base64
      const reader = new FileReader()
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const r = reader.result as string
          resolve(r.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(voiceBlobRef.current!)
      })
      const result = await sendUserWhatsAppAudio(chatNum, audioBase64, voiceBlobRef.current!.type, cliente?.id)
      if (!result.success) showToast?.('error', 'Falha ao enviar áudio: ' + (result.error || ''))
      else showToast?.('success', 'Áudio enviado!')
    } catch (err: any) {
      showToast?.('error', 'Erro ao processar áudio: ' + (err?.message || ''))
    }
    // Cleanup
    voiceBlobRef.current = null
    if (voiceAudioUrl) URL.revokeObjectURL(voiceAudioUrl)
    setVoiceAudioUrl(null)
    setVoiceSeconds(0)
    setSending(false)
  }, [getChatNumber, cliente?.id, voiceSeconds, voiceAudioUrl, showToast])

  const getClientPhone = () => {
    if (!cliente) return ''
    return cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone || ''
  }

  const formatUptime = (s: number) => {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}min`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`
  }

  // ─── Not connected: show QR / connect button ───
  if (!waStatus.connected) {
    return (
      <div className={`bg-white rounded-apple shadow-apple-sm border border-gray-200 ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5 text-green-600" />
            <h3 className={`font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
              Meu WhatsApp Business
            </h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${
            waStatus.status === 'qr' ? 'bg-yellow-400 animate-pulse' :
            (waStatus.status === 'connecting' || waitingForQR) ? 'bg-blue-400 animate-pulse' :
            'bg-gray-300'
          }`} />
          <span className="text-sm text-gray-600">
            {waStatus.status === 'qr' ? 'Escaneie o QR Code abaixo' :
             (waStatus.status === 'connecting' || waitingForQR) ? 'Gerando QR Code...' :
             !botOnline ? 'Backend offline' : 'Desconectado'}
          </span>
        </div>

        {!botOnline && (
          <div className="bg-orange-50 border border-orange-200 rounded-apple p-3 mb-3 text-sm text-orange-700">
            O servidor backend não está online. Verifique as integrações.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-apple p-3 mb-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* QR Code */}
        {qrData && (
          <div className="flex flex-col items-center py-4 mb-4 bg-gray-50 rounded-apple border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-3">Escaneie com o WhatsApp Business</p>
            <img src={qrData} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg shadow-md" />
            <p className="text-xs text-gray-500 mt-3">WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
          </div>
        )}

        {/* Gerando QR Code (aguardando QR do backend) */}
        {!qrData && botOnline && (waitingForQR || waStatus.status === 'connecting') && (
          <div className="flex flex-col items-center py-8">
            <div className="inline-block animate-spin h-10 w-10 border-4 border-green-600 border-t-transparent rounded-full mb-4" />
            <p className="text-sm font-medium text-gray-700">Gerando QR Code...</p>
            <p className="text-xs text-gray-400 mt-1">Aguarde alguns segundos</p>
          </div>
        )}

        {!qrData && botOnline && !waitingForQR && waStatus.status === 'disconnected' && (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">📱</div>
            <p className="text-sm text-gray-600 mb-4">
              Conecte seu WhatsApp Business para enviar e receber mensagens diretamente no CRM.
            </p>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-5 py-2.5 bg-green-600 text-white rounded-apple shadow-apple-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Conectando...' : 'Conectar WhatsApp'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Filtered contacts for search
  const filteredContacts = waContacts.filter(c => {
    if (!contactSearch.trim()) return true
    const q = contactSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.number.includes(q) || (c.notify || '').toLowerCase().includes(q)
  })

  const selectWAContact = (contact: WAContactItem) => {
    setSelectedContact(contact)
    setShowContacts(false)
    setMessages([])
  }

  // ─── Connected ───
  return (
    <div className={`bg-white rounded-apple shadow-apple-sm border-2 border-green-200 flex flex-col ${compact ? '' : 'h-[600px]'}`}>
      {/* Hidden file input for images */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleImageSend(file)
          e.target.value = ''
        }}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-green-100 bg-green-50 rounded-t-apple">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                WhatsApp conectado — {waStatus.number}
              </p>
              <p className="text-xs text-green-600">
                {loggedUser?.nome} • Uptime: {formatUptime(waStatus.uptime)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowContacts(!showContacts); if (!showContacts) loadContacts() }}
              title="Contatos do WhatsApp"
              className={`p-1.5 rounded-full transition-colors ${showContacts ? 'bg-green-600 text-white' : 'text-green-700 hover:bg-green-100'}`}
            >
              <UserGroupIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              title="Desconectar"
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Validation banner — validates ALL CRM clients against WhatsApp */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-green-50">
        {!validating && !validationResult && (
          <button
            onClick={async () => {
              setValidating(true)
              setValidationResult(null)
              try {
                const result = await validateWhatsAppContacts()
                setValidationResult(result)
              } catch (err: any) {
                showToast?.('error', err?.message || 'Erro ao validar contatos')
                setValidating(false)
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Validar todos os números do CRM no WhatsApp
          </button>
        )}

        {validating && (
          <div className="flex items-center gap-3 py-1">
            <ArrowPathIcon className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">Validando números dos clientes...</p>
              <p className="text-[11px] text-blue-600">Verificando cada número nos servidores do WhatsApp (pode levar alguns minutos)</p>
              <div className="mt-1.5 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}

        {validationResult && !validating && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">
                Validação concluída — {validationResult.total} clientes verificados
              </p>
              <button
                onClick={() => setValidationResult(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Fechar
              </button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-green-100 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-green-700">{validationResult.valid}</p>
                <p className="text-[10px] text-green-600 font-medium">Válidos</p>
              </div>
              <div className="flex-1 bg-red-100 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-red-700">{validationResult.invalid}</p>
                <p className="text-[10px] text-red-600 font-medium">Inválidos</p>
              </div>
              {validationResult.errors > 0 && (
                <div className="flex-1 bg-yellow-100 rounded-lg px-3 py-2 text-center">
                  <p className="text-lg font-bold text-yellow-700">{validationResult.errors}</p>
                  <p className="text-[10px] text-yellow-600 font-medium">Erros</p>
                </div>
              )}
            </div>
            <button
              onClick={async () => {
                setValidating(true)
                setValidationResult(null)
                try {
                  const result = await validateWhatsAppContacts()
                  setValidationResult(result)
                } catch (err: any) {
                  showToast?.('error', err?.message || 'Erro ao validar contatos')
                }
                setValidating(false)
              }}
              className="w-full text-xs text-blue-600 hover:text-blue-800 font-medium py-1"
            >
              ↻ Validar novamente
            </button>
          </div>
        )}
      </div>

      {/* Contacts sidebar overlay */}
      {showContacts && (
        <div className="border-b border-gray-200 bg-white max-h-[350px] flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Buscar contato..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 bg-gray-50"
                autoFocus
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1 px-1">
              {waContacts.length} contatos sincronizados
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contactsLoading && waContacts.length === 0 ? (
              <div className="text-center py-6">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                <p className="text-xs text-gray-500 mt-2">Carregando contatos...</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-6">
                <ChatBubbleLeftRightIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">
                  {contactSearch ? 'Nenhum contato encontrado' : 'Nenhum contato sincronizado ainda'}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Os contatos aparecem conforme você usa o WhatsApp
                </p>
              </div>
            ) : (
              filteredContacts.map(c => (
                <button
                  key={c.jid}
                  onClick={() => selectWAContact(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 transition-colors text-left border-b border-gray-50 ${
                    selectedContact?.jid === c.jid ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">
                      {(c.name || c.number).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.notify || c.name || c.number}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      +{c.number}
                      {c.lastMsgTimestamp ? ` • ${new Date(c.lastMsgTimestamp * 1000).toLocaleDateString('pt-BR')}` : ''}
                    </p>
                  </div>
                  {(c.unreadCount ?? 0) > 0 && (
                    <span className="w-5 h-5 bg-green-500 text-white text-[10px] rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chat area */}
      {hasChatTarget ? (
        <>
          {/* Contact info bar */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {getChatName().charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{getChatName()}</p>
              <p className="text-xs text-gray-500 truncate">
                +{getChatNumber()}
                {selectedContact && !cliente && (
                  <span className="ml-1 text-green-600">(Contato WhatsApp)</span>
                )}
              </p>
            </div>
            {getChatNumber() && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setCallMode('phone'); setShowCallRecorder(true) }}
                  title="Ligar (telefone) + gravar"
                  className="p-2 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  <PhoneIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setCallMode('whatsapp'); setShowCallRecorder(true) }}
                  title="Ligar via WhatsApp + gravar"
                  className="p-2 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </button>
                {selectedContact && !cliente && (
                  <button
                    onClick={() => { setSelectedContact(null); setMessages([]) }}
                    title="Voltar para contatos"
                    className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]" style={{ minHeight: compact ? 200 : 300 }}>
            {chatLoading && (
              <div className="text-center py-4">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
              </div>
            )}
            {!chatLoading && messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-gray-600 bg-white bg-opacity-80 inline-block px-4 py-2 rounded-lg shadow-sm">
                  Envie uma mensagem para {getChatName()}
                </p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from === 'me' ? 'justify-end' : msg.from === 'them' ? 'justify-start' : 'justify-center'}`}>
                {msg.from === 'system' ? (
                  <div className="bg-yellow-100 text-yellow-800 text-xs px-3 py-1.5 rounded-lg max-w-[85%] shadow-sm">
                    {msg.text}
                  </div>
                ) : msg.from === 'them' ? (
                  <div className="bg-white text-gray-900 text-sm px-3 py-2 rounded-lg max-w-[85%] shadow-sm">
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <p className="text-[10px] text-gray-500 text-right mt-1">{msg.time}</p>
                  </div>
                ) : (
                  <div className="bg-[#dcf8c6] text-gray-900 text-sm px-3 py-2 rounded-lg max-w-[85%] shadow-sm">
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <p className="text-[10px] text-gray-500 text-right mt-1">{msg.time} ✓✓</p>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-gray-100 border-t border-gray-200 rounded-b-apple">
            {/* Voice recording preview */}
            {voiceAudioUrl && !isRecordingVoice && (
              <div className="flex items-center gap-2 mb-2 bg-white rounded-full px-3 py-2 border border-green-200">
                <audio controls src={voiceAudioUrl} className="h-8 flex-1" style={{ minWidth: 0 }} />
                <button onClick={sendVoiceMessage} disabled={sending} title="Enviar áudio" className="w-8 h-8 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
                  <PaperAirplaneIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={cancelVoiceRecording} title="Descartar áudio" className="w-8 h-8 bg-red-100 hover:bg-red-200 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Voice recording in progress */}
            {isRecordingVoice && (
              <div className="flex items-center gap-3 mb-2 bg-red-50 rounded-full px-4 py-2.5 border border-red-200">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-sm font-mono font-bold text-red-700 flex-shrink-0">
                  {Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:{(voiceSeconds % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-xs text-red-500 flex-1">Gravando...</span>
                <button onClick={cancelVoiceRecording} title="Cancelar" className="w-8 h-8 bg-white hover:bg-gray-100 text-gray-500 rounded-full flex items-center justify-center flex-shrink-0 transition-colors border border-gray-200">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={stopVoiceRecording} title="Parar e enviar" className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
                  <StopIcon className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Text input row */}
            {!isRecordingVoice && (
              <div className="flex gap-1.5">
                <button
                  onClick={handleSuggestText}
                  disabled={sending || suggestingText || !hasChatTarget}
                  title="Sugerir texto comercial com IA"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-gray-200 text-gray-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-40 text-xs font-bold"
                >
                  {suggestingText ? '…' : '✨'}
                </button>
                <button
                  onClick={() => { setAiMode(!aiMode); if (!aiMode) setAiHistory([]) }}
                  title={aiMode ? 'Modo IA ativo — clique para desativar' : 'Ativar Assistente IA'}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 text-xs ${aiMode ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600 hover:bg-purple-100'}`}
                >
                  🤖
                </button>
                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={sending || !getChatNumber()}
                  title="Enviar imagem"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-gray-200 text-gray-600 hover:bg-blue-100 hover:text-blue-600 disabled:opacity-40"
                >
                  <PhotoIcon className="h-4 w-4" />
                </button>
                <textarea
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={aiMode ? 'Pergunte algo à IA do CRM...' : 'Mensagem...'}
                  rows={1}
                  className={`flex-1 px-3 py-2 border rounded-full focus:outline-none focus:ring-2 text-sm resize-none ${aiMode ? 'border-purple-300 focus:ring-purple-500 bg-purple-50' : 'border-gray-300 focus:ring-green-500'}`}
                />
                {chatText.trim() ? (
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="w-9 h-9 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    {sending ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
                  </button>
                ) : (
                  <button
                    onClick={startVoiceRecording}
                    disabled={sending}
                    title="Gravar mensagem de voz"
                    className="w-9 h-9 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <MicrophoneIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-gray-700 font-semibold">WhatsApp Business conectado!</p>
            <p className="text-sm text-gray-500 mt-2">
              {cliente === null && !selectedContact
                ? 'Selecione uma tarefa com cliente ou abra seus contatos do WhatsApp.'
                : 'Selecione um contato para enviar mensagens.'}
            </p>
            <button
              onClick={() => { setShowContacts(true); loadContacts() }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <UserGroupIcon className="h-4 w-4" />
              Ver Contatos ({waContacts.length})
            </button>
          </div>
        </div>
      )}
      {/* Call Recorder overlay */}
      {showCallRecorder && getChatNumber() && (
        <CallRecorder
          cliente={cliente}
          vendedorId={loggedUser?.id}
          phoneNumber={formatBrazilianPhone(getChatNumber())}
          contactName={getChatName()}
          callMode={callMode}
          onClose={() => setShowCallRecorder(false)}
        />
      )}
    </div>
  )
}

export default WhatsAppUserPanel
