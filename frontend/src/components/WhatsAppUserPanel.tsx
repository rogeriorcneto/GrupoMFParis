import React, { useState, useEffect, useRef, useCallback } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ArrowPathIcon, QrCodeIcon, PhoneIcon, MicrophoneIcon, StopIcon, TrashIcon, PhotoIcon, MagnifyingGlassIcon, UserGroupIcon, ChatBubbleLeftRightIcon, SparklesIcon, CpuChipIcon, CheckCircleIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline'
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
  id: number | string
  text: string
  from: 'me' | 'them' | 'system'
  time: string
  mediaUrl?: string
  tipo?: string
  fileName?: string
}

/** Renderiza o corpo da mensagem — mídia (áudio, imagem, vídeo, doc) ou texto */
function renderMessageContent(msg: Message, isMine = false) {
  if (msg.mediaUrl) {
    switch (msg.tipo) {
      case 'audio':
        return <audio controls src={msg.mediaUrl} className="w-full max-w-[240px] h-9" />
      case 'image':
        return (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
            <img src={msg.mediaUrl} alt={msg.text} className="rounded-xl max-w-[240px] max-h-[240px] object-cover mb-1" />
          </a>
        )
      case 'video':
        return <video controls src={msg.mediaUrl} className="rounded-xl max-w-[240px] max-h-[240px] mb-1" />
      case 'document':
        return (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className={`underline text-xs block mb-1 ${isMine ? 'text-white/90' : 'text-primary-700'}`}>
            {msg.fileName || 'Abrir documento'}
          </a>
        )
      default:
        break
    }
  }
  return <p className="whitespace-pre-wrap">{msg.text}</p>
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
  // IMPORTANTE: limpa imediatamente o histórico anterior ao trocar de cliente/contato
  // e cancela respostas atrasadas (evita vazar mensagens de uma conversa em outra)
  useEffect(() => {
    let cancelled = false
    setMessages([])

    if (!waStatus.connected) {
      setChatLoading(false)
      return () => { cancelled = true }
    }
    if (!cliente?.id && !selectedContact) {
      setChatLoading(false)
      return () => { cancelled = true }
    }

    const chatNumber = selectedContact?.number || (cliente?.whatsapp || cliente?.contatoCelular || cliente?.contatoTelefone || '').replace(/\D/g, '')
    const digitsLocal = chatNumber.startsWith('55') && chatNumber.length >= 12 ? chatNumber.slice(4) : chatNumber.slice(-8)
    const isFakePhone = !chatNumber || chatNumber.length < 8 || /^(\d)\1{7,}$/.test(digitsLocal)

    if (isFakePhone && !cliente?.id) {
      setChatLoading(false)
      return () => { cancelled = true }
    }

    setChatLoading(true)

    const tryCache = !isFakePhone
      ? fetchWhatsAppChatMessages({ jid: selectedContact?.jid, numero: chatNumber, clienteId: cliente?.id, limit: 100 })
      : Promise.resolve([])

    tryCache.then(cachedMsgs => {
      if (cancelled) return
      if (cachedMsgs && cachedMsgs.length > 0) {
        setMessages(cachedMsgs.map((m: any) => ({
          id: m.id || `${m.timestamp}-${m.text}`,
          text: m.text,
          mediaUrl: m.mediaUrl,
          tipo: m.type || m.tipo,
          fileName: m.fileName,
          from: m.fromMe ? 'me' as const : 'them' as const,
          time: m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        })))
        setChatLoading(false)
        return
      }
      const dbPromise = cliente?.id
        ? fetchWhatsAppMessages({ clienteId: cliente.id, limit: 100 })
        : !isFakePhone
          ? fetchWhatsAppMessages({ numero: chatNumber, limit: 100 })
          : Promise.resolve([])

      dbPromise.then(dbMsgs => {
        if (cancelled) return
        setMessages((dbMsgs || []).map((m: any) => ({
          id: m.id || `${m.createdAt}-${m.mensagem}`,
          text: m.mensagem,
          mediaUrl: m.mediaUrl,
          tipo: m.tipo,
          fileName: m.fileName,
          from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
          time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        })))
      }).catch(() => {}).finally(() => { if (!cancelled) setChatLoading(false) })
    }).catch(() => {
      if (!cancelled) setChatLoading(false)
    })

    return () => { cancelled = true }
  }, [waStatus.connected, cliente?.id, cliente?.whatsapp, cliente?.contatoCelular, cliente?.contatoTelefone, selectedContact?.jid])

  // Poll WA messages every 5s when chat is open (isolado por conversa ativa)
  useEffect(() => {
    if (!waStatus.connected) return
    if (!cliente?.id && !selectedContact) return
    const chatNumber = selectedContact?.number || (cliente?.whatsapp || cliente?.contatoCelular || cliente?.contatoTelefone || '').replace(/\D/g, '')
    const digitsLocal = chatNumber.startsWith('55') && chatNumber.length >= 12 ? chatNumber.slice(4) : chatNumber.slice(-8)
    const isFakePhone = !chatNumber || chatNumber.length < 8 || /^(\d)\1{7,}$/.test(digitsLocal)
    if (isFakePhone && !cliente?.id) return

    let cancelled = false
    const iv = setInterval(() => {
      const req = !isFakePhone
        ? fetchWhatsAppChatMessages({ jid: selectedContact?.jid, numero: chatNumber, clienteId: cliente?.id, limit: 100 })
        : Promise.resolve([])

      req.then(cached => {
        if (cancelled) return
        if (cached && cached.length > 0) {
          const incoming: Message[] = cached.map((m: any) => ({
            id: m.id || `${m.timestamp}-${m.text}`,
            text: m.text,
            mediaUrl: m.mediaUrl,
            tipo: m.type || m.tipo,
            fileName: m.fileName,
            from: m.fromMe ? 'me' as const : 'them' as const,
            time: m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
          }))
          setMessages(prev => {
            // Preserva apenas mensagens de sistema/otimistas locais recentes que ainda não vieram do servidor
            const systemMsgs = prev.filter(m => m.from === 'system')
            const incomingTexts = new Set(incoming.map(m => `${m.from}|${m.text}`))
            const pendingLocal = prev.filter(m => typeof m.id === 'number' && !incomingTexts.has(`${m.from}|${m.text}`))
            return [...incoming, ...pendingLocal, ...systemMsgs]
          })
        } else if (cliente?.id) {
          fetchWhatsAppMessages({ clienteId: cliente.id, limit: 100 }).then(dbMsgs => {
            if (cancelled || !dbMsgs || dbMsgs.length === 0) return
            const incoming: Message[] = dbMsgs.map((m: any) => ({
              id: m.id || `${m.createdAt}-${m.mensagem}`,
              text: m.mensagem,
              mediaUrl: m.mediaUrl,
              tipo: m.tipo,
              fileName: m.fileName,
              from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
              time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            }))
            setMessages(prev => {
              const systemMsgs = prev.filter(m => m.from === 'system')
              return [...incoming, ...systemMsgs]
            })
          }).catch(() => {})
        }
      }).catch(() => {})
    }, 5_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [waStatus.connected, cliente?.id, cliente?.whatsapp, cliente?.contatoCelular, cliente?.contatoTelefone, selectedContact?.jid])

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
      <div className={`bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple border border-black/[0.06] dark:border-white/[0.08] ${compact ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5 text-gray-700 dark:text-gray-200" />
            <h3 className={`font-semibold tracking-tight text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
              WhatsApp Business
            </h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-block w-2 h-2 rounded-full ${
            waStatus.status === 'qr' ? 'bg-amber-400 animate-pulse' :
            (waStatus.status === 'connecting' || waitingForQR) ? 'bg-blue-500 animate-pulse' :
            'bg-gray-300'
          }`} />
          <span className="text-xs text-gray-500">
            {waStatus.status === 'qr' ? 'Escaneie o QR Code abaixo' :
             (waStatus.status === 'connecting' || waitingForQR) ? 'Gerando QR Code...' :
             !botOnline ? 'Servidor offline' : 'Desconectado'}
          </span>
        </div>

        {!botOnline && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800">
            O servidor backend não está online. Verifique as integrações.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* QR Code */}
        {qrData && (
          <div className="flex flex-col items-center py-5 mb-4 bg-[#F5F5F7] dark:bg-[#242428] rounded-2xl border border-black/[0.05]">
            <p className="text-xs font-medium text-gray-700 mb-3">Escaneie com o WhatsApp Business</p>
            <img src={qrData} alt="WhatsApp QR Code" className="w-52 h-52 rounded-xl bg-white p-2 shadow-sm" />
            <p className="text-[11px] text-gray-400 mt-3">WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
          </div>
        )}

        {/* Gerando QR Code (aguardando QR do backend) */}
        {!qrData && botOnline && (waitingForQR || waStatus.status === 'connecting') && (
          <div className="flex flex-col items-center py-8">
            <div className="inline-block animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full mb-3" />
            <p className="text-xs font-medium text-gray-700">Gerando QR Code...</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Aguarde alguns segundos</p>
          </div>
        )}

        {!qrData && botOnline && !waitingForQR && waStatus.status === 'disconnected' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] dark:bg-[#262629] flex items-center justify-center mx-auto mb-3">
              <DevicePhoneMobileIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
            </div>
            <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
              Conecte seu WhatsApp Business para enviar e receber mensagens diretamente no CRM.
            </p>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-5 py-2 bg-primary-700 text-white rounded-xl shadow-apple-sm text-xs font-semibold hover:bg-primary-800 transition-colors disabled:opacity-50"
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

  // ─── Connected (Apple Messages / macOS Sonoma style — Light & Dark) ───
  return (
    <div className={`bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple border border-black/[0.07] dark:border-white/[0.10] flex flex-col overflow-hidden ${compact ? '' : 'h-[600px]'}`}>
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
      <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/95 dark:bg-[#1C1C1E]/95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-xs font-semibold text-gray-900 tabular-nums">
                WhatsApp conectado · {waStatus.number}
              </p>
              <p className="text-[11px] text-gray-400 tabular-nums">
                {loggedUser?.nome} · {formatUptime(waStatus.uptime)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowContacts(!showContacts); if (!showContacts) loadContacts() }}
              title="Contatos do WhatsApp"
              className={`p-1.5 rounded-lg transition-colors ${showContacts ? 'bg-primary-700 text-white' : 'bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 hover:bg-black/[0.08]'}`}
            >
              <UserGroupIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              title="Desconectar sessão"
              className="px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Desconectar
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Validation bar — discreta e neutra */}
      <div className="px-4 py-2 border-b border-black/[0.05] dark:border-white/[0.07] bg-[#F5F5F7]/70 dark:bg-[#161618]">
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
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white dark:bg-[#242428] border border-black/[0.07] dark:border-white/[0.08] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <CheckCircleIcon className="h-3.5 w-3.5 text-gray-500" />
            Validar números do CRM no WhatsApp
          </button>
        )}

        {validating && (
          <div className="flex items-center gap-2.5 py-1">
            <ArrowPathIcon className="h-4 w-4 text-primary-600 animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-800">Validando números dos clientes...</p>
              <div className="mt-1 h-1 bg-black/[0.08] rounded-full overflow-hidden">
                <div className="h-full bg-primary-600 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}

        {validationResult && !validating && (
          <div className="space-y-2 tabular-nums">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-800">
                {validationResult.total} clientes verificados
              </p>
              <button
                onClick={() => setValidationResult(null)}
                className="text-[11px] text-gray-400 hover:text-gray-600"
              >
                Fechar
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-white dark:bg-[#242428] border border-gray-200 rounded-lg px-2.5 py-1.5 text-center">
                <p className="text-sm font-semibold text-emerald-600">{validationResult.valid}</p>
                <p className="text-[10px] text-gray-500">Válidos</p>
              </div>
              <div className="flex-1 bg-white dark:bg-[#242428] border border-gray-200 rounded-lg px-2.5 py-1.5 text-center">
                <p className="text-sm font-semibold text-red-600">{validationResult.invalid}</p>
                <p className="text-[10px] text-gray-500">Inválidos</p>
              </div>
              {validationResult.errors > 0 && (
                <div className="flex-1 bg-white dark:bg-[#242428] border border-gray-200 rounded-lg px-2.5 py-1.5 text-center">
                  <p className="text-sm font-semibold text-amber-600">{validationResult.errors}</p>
                  <p className="text-[10px] text-gray-500">Erros</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contacts sidebar overlay */}
      {showContacts && (
        <div className="border-b border-gray-200 bg-white dark:bg-[#1C1C1E] max-h-[340px] flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Buscar contato..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/25 bg-[#F5F5F7] dark:bg-[#262629]"
                autoFocus
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1 px-1 tabular-nums">
              {waContacts.length} contatos sincronizados
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contactsLoading && waContacts.length === 0 ? (
              <div className="text-center py-6">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-primary-600 border-t-transparent rounded-full" />
                <p className="text-xs text-gray-500 mt-2">Carregando contatos...</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-6">
                <ChatBubbleLeftRightIcon className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">
                  {contactSearch ? 'Nenhum contato encontrado' : 'Nenhum contato sincronizado ainda'}
                </p>
              </div>
            ) : (
              filteredContacts.map(c => (
                <button
                  key={c.jid}
                  onClick={() => selectWAContact(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left border-b border-gray-100/70 ${
                    selectedContact?.jid === c.jid ? 'bg-gray-50' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#EFEFF4] dark:bg-[#2C2C30] flex items-center justify-center flex-shrink-0">
                    <span className="text-gray-700 dark:text-gray-200 text-xs font-semibold">
                      {(c.name || c.number).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">
                      {c.notify || c.name || c.number}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate tabular-nums">
                      +{c.number}
                      {c.lastMsgTimestamp ? ` · ${new Date(c.lastMsgTimestamp * 1000).toLocaleDateString('pt-BR')}` : ''}
                    </p>
                  </div>
                  {(c.unreadCount ?? 0) > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-primary-700 text-white text-[10px] rounded-full flex items-center justify-center flex-shrink-0 font-bold tabular-nums">
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
          <div className="px-4 py-2.5 bg-white dark:bg-[#1C1C1E] border-b border-black/[0.05] dark:border-white/[0.07] flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#EFEFF4] dark:bg-[#2C2C30] flex items-center justify-center">
              <span className="text-gray-800 dark:text-gray-200 text-xs font-semibold">
                {getChatName().charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{getChatName()}</p>
              <p className="text-[11px] text-gray-400 truncate tabular-nums">
                +{getChatNumber()}
              </p>
            </div>
            {getChatNumber() && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setCallMode('phone'); setShowCallRecorder(true) }}
                  title="Ligar (telefone) + gravar"
                  className="p-1.5 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 hover:bg-black/[0.08] transition-colors"
                >
                  <PhoneIcon className="h-4 w-4" />
                </button>
                {selectedContact && !cliente && (
                  <button
                    onClick={() => { setSelectedContact(null); setMessages([]) }}
                    title="Voltar para contatos"
                    className="p-1.5 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-600 hover:bg-black/[0.08] transition-colors"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Messages — Apple Messages style (Claro e Escuro) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#F5F5F7] dark:bg-[#141416]" style={{ minHeight: compact ? 200 : 300 }}>
            {chatLoading && (
              <div className="text-center py-4">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-primary-600 border-t-transparent rounded-full" />
              </div>
            )}
            {!chatLoading && messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-xs text-gray-400">
                  Envie uma mensagem para {getChatName()}
                </p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from === 'me' ? 'justify-end' : msg.from === 'them' ? 'justify-start' : 'justify-center'}`}>
                {msg.from === 'system' ? (
                  <div className="bg-white dark:bg-[#262629] border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-full max-w-[85%] shadow-sm">
                    {msg.text}
                  </div>
                ) : msg.from === 'them' ? (
                  <div className="text-[13px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-bl-sm max-w-[82%] shadow-sm bg-white dark:bg-[#262629] text-gray-900 dark:text-gray-100 border border-black/[0.04] dark:border-white/[0.06]">
                    {renderMessageContent(msg, false)}
                    <p className="text-[10px] text-right mt-1 text-gray-400 tabular-nums">{msg.time}</p>
                  </div>
                ) : (
                  <div className="text-[13px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-br-sm max-w-[82%] shadow-sm bg-primary-700 dark:bg-[#2A4380] text-white">
                    {renderMessageContent(msg, true)}
                    <p className="text-[10px] text-right mt-1 text-white/70 tabular-nums">{msg.time} · enviada</p>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-2.5 bg-white dark:bg-[#1C1C1E] border-t border-black/[0.06] dark:border-white/[0.08]">
            {voiceAudioUrl && !isRecordingVoice && (
              <div className="flex items-center gap-2 mb-2 bg-[#F5F5F7] dark:bg-[#262629] rounded-full px-3 py-1.5 border border-gray-200">
                <audio controls src={voiceAudioUrl} className="h-8 flex-1" style={{ minWidth: 0 }} />
                <button onClick={sendVoiceMessage} disabled={sending} title="Enviar áudio" className="w-8 h-8 bg-primary-700 hover:bg-primary-800 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
                  <PaperAirplaneIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={cancelVoiceRecording} title="Descartar áudio" className="w-8 h-8 bg-red-50 hover:bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {isRecordingVoice && (
              <div className="flex items-center gap-3 mb-2 bg-red-50/80 rounded-full px-4 py-2 border border-red-200">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-xs font-semibold text-red-700 flex-shrink-0 tabular-nums">
                  {Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:{(voiceSeconds % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-xs text-red-600 flex-1">Gravando...</span>
                <button onClick={cancelVoiceRecording} title="Cancelar" className="w-7 h-7 bg-white text-gray-500 rounded-full flex items-center justify-center flex-shrink-0 border border-gray-200">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={stopVoiceRecording} title="Parar e enviar" className="w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                  <StopIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {!isRecordingVoice && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSuggestText}
                  disabled={sending || suggestingText || !hasChatTarget}
                  title="Sugerir texto comercial"
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-[#EFEFF4] dark:bg-[#262629] text-gray-600 hover:text-gray-900 disabled:opacity-40"
                >
                  <SparklesIcon className={`h-4 w-4 ${suggestingText ? 'animate-pulse' : ''}`} />
                </button>
                <button
                  onClick={() => { setAiMode(!aiMode); if (!aiMode) setAiHistory([]) }}
                  title={aiMode ? 'Modo assistente ativo — clique para desativar' : 'Ativar assistente no chat'}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${aiMode ? 'bg-primary-700 text-white' : 'bg-[#EFEFF4] dark:bg-[#262629] text-gray-600 hover:text-gray-900'}`}
                >
                  <CpuChipIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={sending || !getChatNumber()}
                  title="Enviar imagem"
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-[#EFEFF4] dark:bg-[#262629] text-gray-600 hover:text-gray-900 disabled:opacity-40"
                >
                  <PhotoIcon className="h-4 w-4" />
                </button>
                <textarea
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={aiMode ? 'Pergunte algo ao assistente...' : 'Mensagem...'}
                  rows={1}
                  className="flex-1 px-3.5 py-2 border border-black/[0.08] dark:border-white/[0.10] bg-[#F5F5F7] dark:bg-[#262629] rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500/25 text-xs resize-none"
                />
                {chatText.trim() ? (
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="w-8 h-8 bg-primary-700 hover:bg-primary-800 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    {sending ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
                  </button>
                ) : (
                  <button
                    onClick={startVoiceRecording}
                    disabled={sending}
                    title="Gravar mensagem de voz"
                    className="w-8 h-8 bg-[#EFEFF4] dark:bg-[#262629] hover:bg-black/[0.08] disabled:opacity-40 text-gray-700 dark:text-gray-200 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <MicrophoneIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F5F5F7]/50 dark:bg-[#141416]">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-gray-900 font-semibold text-sm">WhatsApp Business conectado</p>
            <p className="text-xs text-gray-500 mt-1.5 max-w-xs">
              {cliente === null && !selectedContact
                ? 'Selecione uma tarefa com cliente ou abra seus contatos.'
                : 'Selecione um contato para enviar mensagens.'}
            </p>
            <button
              onClick={() => { setShowContacts(true); loadContacts() }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white rounded-xl text-xs font-semibold hover:bg-primary-800 transition-colors shadow-apple-sm"
            >
              <UserGroupIcon className="h-4 w-4" />
              Ver contatos ({waContacts.length})
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
