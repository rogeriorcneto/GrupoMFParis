import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  XMarkIcon, PaperAirplaneIcon, ArrowPathIcon,
  ChatBubbleLeftIcon, EnvelopeIcon, DevicePhoneMobileIcon,
  MagnifyingGlassIcon, PencilSquareIcon, CheckCircleIcon,
  ClipboardDocumentIcon, ClockIcon, UserGroupIcon,
  PlusIcon, ChevronRightIcon,
  MicrophoneIcon, StopIcon, TrashIcon, PhotoIcon,
  PhoneIcon, PhoneXMarkIcon,
} from '@heroicons/react/24/outline'
import WhatsAppIcon from './icons/WhatsAppIcon'
import type { Tarefa, Cliente, Vendedor, Interacao, Pedido } from '../types'
import { callAIFull, buildCRMContext } from '../lib/gemini'
import type { AIMessage, AIUIAction } from '../lib/gemini'
import {
  sendUserWhatsApp, getUserWhatsAppStatus,
  fetchWhatsAppChatMessages, fetchWhatsAppMessages,
  sendUserWhatsAppAudio, sendUserWhatsAppImage,
} from '../lib/botApi'
import { sendEmailViaBot } from '../lib/botApi'
import * as db from '../lib/database'
import { formatBrazilianPhone } from '../utils/validators'
import { loadConversationByChannel as loadConversation, saveConversationByChannel as saveConversation, clearConversationByChannel as clearConversation } from '../lib/aiConversations'

// ── Types ──

interface WorkspaceProps {
  loggedUser: Vendedor | null
  clientes: Cliente[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  pedidos: Pedido[]
  tarefas: Tarefa[]
  cliente?: Cliente | null
  onClose: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
  onAddTarefa?: (t: Tarefa) => void
  onUpdateTarefa?: (t: Tarefa) => void
  onRefreshData?: () => void
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

interface WorkspaceAction {
  id: number
  tipo: string
  descricao: string
  timestamp: string
  clienteNome?: string
}

type SidebarTool = 'whatsapp' | 'email' | 'notas' | 'buscar' | 'tarefas' | 'historico' | null

// ── Markdown renderer (same as AssistenteIAView) ──

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="font-bold text-gray-900 mt-3 mb-1 text-sm">{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-gray-900 mt-4 mb-1 text-base">{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={i} className="font-bold text-gray-900 mt-4 mb-2 text-lg">{line.slice(2)}</h1>
    if (line.startsWith('- ') || line.startsWith('• ')) return <li key={i} className="ml-4 text-sm text-gray-700 list-disc">{renderInline(line.slice(2))}</li>
    if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 text-sm text-gray-700 list-decimal">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>
    if (line.trim() === '') return <div key={i} className="h-2" />
    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>
  })
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic">{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-gray-100 text-purple-700 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    return part
  })
}

// ── Main Component ──

const Workspace: React.FC<WorkspaceProps> = ({
  loggedUser, clientes, vendedores, interacoes, pedidos, tarefas,
  cliente: initialCliente, onClose, showToast, onAddTarefa, onUpdateTarefa, onRefreshData,
}) => {
  // ─── State ───
  const [activeTool, setActiveTool] = useState<SidebarTool>(null)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(initialCliente || null)
  const [actions, setActions] = useState<WorkspaceAction[]>([])

  // AI Chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [wsConversationLoaded, setWsConversationLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // WhatsApp chat
  const [waText, setWaText] = useState('')
  const [waSending, setWaSending] = useState(false)
  const [waConnected, setWaConnected] = useState(false)
  const [waMessages, setWaMessages] = useState<{ id: number; text: string; from: 'me' | 'them' | 'system'; time: string; type?: string; mediaUrl?: string; mimetype?: string }[]>([])
  const [waChatLoading, setWaChatLoading] = useState(false)
  const waChatEndRef = useRef<HTMLDivElement>(null)
  // Voice recording
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const voiceBlobRef = useRef<Blob | null>(null)
  const waImageInputRef = useRef<HTMLInputElement>(null)

  // Phone call + system audio recording
  const [callStatus, setCallStatus] = useState<'idle' | 'recording' | 'ended' | 'error'>('idle')
  const [callDuration, setCallDuration] = useState(0)
  const [callError, setCallError] = useState<string | null>(null)
  const [callRecordingUrl, setCallRecordingUrl] = useState<string | null>(null)
  const [callSaving, setCallSaving] = useState(false)
  const callRecorderRef = useRef<MediaRecorder | null>(null)
  const callStreamRef = useRef<MediaStream | null>(null)
  const callChunksRef = useRef<Blob[]>([])
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callStartRef = useRef<number>(0)

  // Email tool
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)

  // Notes tool
  const [noteText, setNoteText] = useState('')

  // Search tool
  const [searchQuery, setSearchQuery] = useState('')

  // Quick task
  const [quickTaskTitle, setQuickTaskTitle] = useState('')

  // ─── Init ───

  useEffect(() => {
    const nome = loggedUser?.nome?.split(' ')[0] || 'Vendedor'
    const welcome: ChatMessage = {
      id: '0', role: 'assistant',
      text: `Fala, ${nome}! 🚀\n\nEsse é o seu **Workspace**. Aqui você tem tudo na mão:\n- 🔍 Buscar clientes na barra lateral\n- 📱 Enviar WhatsApp\n- 📧 Enviar email\n- 📝 Adicionar observações\n- ✅ Criar tarefas rápidas\n\nTodas as ações ficam registradas no seu **histórico**. Me pergunte qualquer coisa sobre os dados do CRM!`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }
    loadConversation('workspace').then(saved => {
      if (saved.length > 0) {
        setMessages([welcome, ...saved])
      } else {
        setMessages([welcome])
      }
      setWsConversationLoaded(true)
    }).catch(() => {
      setMessages([welcome])
      setWsConversationLoaded(true)
    })
  }, [loggedUser])

  // Auto-save workspace conversation
  useEffect(() => {
    if (!wsConversationLoaded) return
    const toSave = messages.filter(m => m.id !== '0')
    if (toSave.length > 0) {
      saveConversation('workspace', toSave).catch(() => {})
    }
  }, [messages, wsConversationLoaded])

  useEffect(() => {
    if (bottomRef.current?.scrollIntoView) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, aiLoading])

  useEffect(() => {
    const checkStatus = () => getUserWhatsAppStatus().then(s => setWaConnected(s.connected)).catch(() => {})
    checkStatus()
    const iv = setInterval(checkStatus, 15_000)
    return () => clearInterval(iv)
  }, [])

  // ─── Register action (all workspace actions logged) ───

  const logAction = useCallback(async (tipo: string, descricao: string, clienteNome?: string) => {
    const action: WorkspaceAction = {
      id: Date.now(),
      tipo,
      descricao,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      clienteNome,
    }
    setActions(prev => [action, ...prev])

    // Persist to atividades table
    try {
      await db.insertAtividade({
        tipo,
        descricao: `[Workspace] ${descricao}`,
        vendedorNome: loggedUser?.nome || 'Sistema',
        timestamp: new Date().toISOString(),
      })
    } catch {
      // Silent fail — don't block UX
    }
  }, [loggedUser])

  // Load WA chat messages when client changes
  const getWaChatNumber = useCallback((): string => {
    if (!selectedCliente) return ''
    return (selectedCliente.whatsapp || selectedCliente.contatoCelular || selectedCliente.contatoTelefone || '').replace(/\D/g, '')
  }, [selectedCliente])

  useEffect(() => {
    if (!waConnected || !selectedCliente) { setWaMessages([]); return }
    const num = getWaChatNumber()
    if (!num) return
    setWaChatLoading(true)
    // Try in-memory cache first, then DB
    fetchWhatsAppChatMessages({ numero: num, limit: 100 }).then(cached => {
      if (cached && cached.length > 0) {
        setWaMessages(cached.map((m: any) => ({
          id: m.id || Date.now(), text: m.text,
          from: m.fromMe ? 'me' as const : 'them' as const,
          time: m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
          type: m.type, mediaUrl: m.mediaUrl, mimetype: m.mimetype,
        })))
        setWaChatLoading(false)
        return
      }
      // Fallback: DB
      const p = selectedCliente.id
        ? fetchWhatsAppMessages({ clienteId: selectedCliente.id, limit: 100 })
        : fetchWhatsAppMessages({ numero: num, limit: 100 })
      p.then(dbMsgs => {
        setWaMessages((dbMsgs || []).map((m: any) => ({
          id: m.id || Date.now(), text: m.mensagem,
          from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
          time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
          type: m.tipo,
        })))
      }).catch(() => {}).finally(() => setWaChatLoading(false))
    }).catch(() => setWaChatLoading(false))
  }, [waConnected, selectedCliente, getWaChatNumber])

  // Auto-scroll WA chat
  useEffect(() => {
    waChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [waMessages])

  // Poll WA messages every 5s when chat is open
  useEffect(() => {
    if (!waConnected || !selectedCliente || activeTool !== 'whatsapp') return
    const num = getWaChatNumber()
    if (!num) return
    const iv = setInterval(() => {
      fetchWhatsAppChatMessages({ numero: num, limit: 100 }).then(cached => {
        if (cached && cached.length > 0) {
          const incoming = cached.map((m: any) => ({
            id: m.id || Date.now(), text: m.text,
            from: m.fromMe ? 'me' as const : 'them' as const,
            time: m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            type: m.type, mediaUrl: m.mediaUrl, mimetype: m.mimetype,
          }))
          setWaMessages(prev => {
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
          // Fallback: try DB when cache is empty
          const p = selectedCliente.id
            ? fetchWhatsAppMessages({ clienteId: selectedCliente.id, limit: 100 })
            : fetchWhatsAppMessages({ numero: num, limit: 100 })
          p.then(dbMsgs => {
            if (dbMsgs && dbMsgs.length > 0) {
              const incoming = dbMsgs.map((m: any) => ({
                id: m.id || Date.now(), text: m.mensagem,
                from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
                time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
                type: m.tipo,
              }))
              setWaMessages(prev => {
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
  }, [waConnected, selectedCliente, activeTool, getWaChatNumber])

  // ── WA Voice Recording ──
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
    } catch { showToast?.('error', 'Não foi possível acessar o microfone.') }
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
    const chatNum = getWaChatNumber()
    if (!chatNum) { showToast?.('error', 'Sem número.'); return }
    setWaSending(true)
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const dur = `${Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:${(voiceSeconds % 60).toString().padStart(2, '0')}`
    setWaMessages(prev => [...prev, { id: Date.now(), text: `🎙️ Áudio (${dur})`, from: 'me', time: now }])
    try {
      const reader = new FileReader()
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(voiceBlobRef.current!)
      })
      const result = await sendUserWhatsAppAudio(chatNum, b64, voiceBlobRef.current!.type, selectedCliente?.id)
      if (!result.success) showToast?.('error', 'Falha ao enviar áudio')
      else { showToast?.('success', 'Áudio enviado!'); logAction('whatsapp', `Áudio WA para ${selectedCliente?.razaoSocial} (${dur})`, selectedCliente?.razaoSocial) }
    } catch { showToast?.('error', 'Erro ao processar áudio') }
    cancelVoiceRecording()
    setWaSending(false)
  }, [getWaChatNumber, voiceSeconds, selectedCliente, showToast, cancelVoiceRecording, logAction])

  const handleWaImageSend = useCallback(async (file: File) => {
    const num = getWaChatNumber()
    if (!num) { showToast?.('error', 'Sem número.'); return }
    setWaSending(true)
    try {
      const reader = new FileReader()
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      setWaMessages(prev => [...prev, { id: Date.now(), text: `📷 [Imagem] ${file.name}`, from: 'me', time: now }])
      const result = await sendUserWhatsAppImage(num, b64, file.type, undefined, selectedCliente?.id)
      if (!result.success) showToast?.('error', 'Falha ao enviar imagem')
      else { showToast?.('success', 'Imagem enviada!'); logAction('whatsapp', `Imagem WA para ${selectedCliente?.razaoSocial}`, selectedCliente?.razaoSocial) }
    } catch { showToast?.('error', 'Erro ao processar imagem') }
    setWaSending(false)
  }, [getWaChatNumber, selectedCliente, showToast, logAction])

  // ── Phone Call + Microphone Recording ──
  // Opens tel: link to initiate call via Phone Link / default dialer,
  // and records microphone audio simultaneously.

  const startCall = useCallback(async () => {
    const num = getWaChatNumber()
    if (!num) { showToast?.('error', 'Sem número para ligar.'); return }

    let formattedNum = num.replace(/\D/g, '')
    if (!formattedNum.startsWith('55')) formattedNum = `55${formattedNum}`

    setCallError(null)
    setCallDuration(0)
    setCallRecordingUrl(null)
    callChunksRef.current = []

    try {
      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      })
      callStreamRef.current = stream

      // 2. Start recording
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) callChunksRef.current.push(e.data)
      }
      recorder.start(1000)
      callRecorderRef.current = recorder

      // 3. Start timer
      callStartRef.current = Date.now()
      callTimerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000))
      }, 1000)

      setCallStatus('recording')

      // 4. Open dialer — works via Phone Link (Windows) or mobile browser
      window.open(`tel:+${formattedNum}`, '_self')

      showToast?.('success', 'Ligação iniciada! Gravando microfone...')
    } catch (err: any) {
      setCallStatus('error')
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCallError('Permissão do microfone negada. Habilite nas configurações do navegador e tente novamente.')
      } else {
        setCallError(err?.message || 'Erro ao acessar microfone.')
      }
    }
  }, [getWaChatNumber, showToast])

  const endCall = useCallback(async () => {
    // Stop recording
    if (callRecorderRef.current && callRecorderRef.current.state !== 'inactive') {
      callRecorderRef.current.stop()
    }
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null }

    // Stop all streams
    if (callStreamRef.current) {
      callStreamRef.current.getTracks().forEach(t => t.stop())
      const extras = (callStreamRef.current as any)?._extraStreams as MediaStream[] | undefined
      extras?.forEach(s => s.getTracks().forEach(t => t.stop()))
      const audioCtx = (callStreamRef.current as any)?._audioCtx as AudioContext | undefined
      audioCtx?.close()
      callStreamRef.current = null
    }
    callRecorderRef.current = null

    // Build audio blob
    const num = getWaChatNumber() || ''
    if (callChunksRef.current.length > 0) {
      const blob = new Blob(callChunksRef.current, { type: 'audio/webm' })
      const localUrl = URL.createObjectURL(blob)
      setCallRecordingUrl(localUrl)

      setCallSaving(true)
      let arquivoUrl: string | null = null
      let arquivoPath: string | null = null

      // Upload to Supabase Storage
      try {
        const { supabase } = await import('../lib/supabase')
        const vendedorFolder = loggedUser?.id || 'unknown'
        const fileName = `call_${Date.now()}_${selectedCliente?.id || 'wa'}.webm`
        const storagePath = `${vendedorFolder}/${fileName}`

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('call-recordings')
          .upload(storagePath, blob, { contentType: 'audio/webm', upsert: false })

        if (!uploadErr && uploadData) {
          arquivoPath = uploadData.path
          const { data: urlData } = supabase.storage.from('call-recordings').getPublicUrl(uploadData.path)
          arquivoUrl = urlData?.publicUrl || null
          if (arquivoUrl) setCallRecordingUrl(arquivoUrl)
        }
      } catch { /* bucket pode não existir ainda — local URL ainda funciona */ }

      // Save metadata to gravacoes_chamada table
      try {
        const { supabase } = await import('../lib/supabase')
        await supabase.from('gravacoes_chamada').insert({
          cliente_id: selectedCliente?.id || null,
          vendedor_id: loggedUser?.id || null,
          numero_telefone: num,
          duracao_segundos: callDuration,
          arquivo_url: arquivoUrl,
          arquivo_path: arquivoPath,
          tamanho_bytes: blob.size,
          tipo_chamada: 'phone',
          notas: null,
        })
      } catch { /* non-critical */ }

      setCallSaving(false)
    }

    // Log activity
    logAction('call', `Ligação para ${selectedCliente?.razaoSocial} (${num}) — ${Math.floor(callDuration / 60)}m${callDuration % 60}s`, selectedCliente?.razaoSocial)
    if (selectedCliente) {
      try {
        await db.insertAtividade({
          tipo: 'ligacao',
          descricao: `[Workspace] Ligação para ${selectedCliente.razaoSocial} (${num}) — Gravação: ${callDuration}s`,
          vendedorNome: loggedUser?.nome || 'Vendedor',
          timestamp: new Date().toISOString(),
        })
        await db.insertInteracao({
          clienteId: selectedCliente.id,
          tipo: 'ligacao',
          data: new Date().toISOString(),
          assunto: 'Ligação via CRM',
          descricao: `Ligação para ${num} — Duração: ${Math.floor(callDuration / 60)}m${callDuration % 60}s`,
          automatico: false,
        })
      } catch { /* non-critical */ }
    }

    setCallStatus('ended')
    callChunksRef.current = []
  }, [selectedCliente, loggedUser, callDuration, getWaChatNumber, logAction])

  const dismissCall = useCallback(() => {
    if (callRecordingUrl?.startsWith('blob:')) URL.revokeObjectURL(callRecordingUrl)
    setCallStatus('idle')
    setCallError(null)
    setCallRecordingUrl(null)
    setCallDuration(0)
  }, [callRecordingUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callRecorderRef.current && callRecorderRef.current.state !== 'inactive') callRecorderRef.current.stop()
      if (callStreamRef.current) {
        callStreamRef.current.getTracks().forEach(t => t.stop())
        const extras = (callStreamRef.current as any)?._extraStreams as MediaStream[] | undefined
        extras?.forEach(s => s.getTracks().forEach(t => t.stop()))
      }
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [])

  // Pre-fill email when client selected
  useEffect(() => {
    if (selectedCliente) {
      setEmailTo(selectedCliente.contatoEmail || '')
    }
  }, [selectedCliente])

  // ─── AI Chat ───

  const systemPrompt = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser: loggedUser || undefined })

  const sendAIMessage = async (text: string) => {
    if (!text.trim() || aiLoading) return
    setAiError(null)
    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: 'user', text: text.trim(),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setAiInput('')
    setAiLoading(true)

    try {
      const history: AIMessage[] = messages
        .filter(m => m.id !== '0')
        .map(m => ({ role: m.role, content: m.text }))
      history.push({ role: 'user', content: text.trim() })

      const result = await callAIFull(history, systemPrompt)
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant', text: result.response,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }])
      logAction('ia', `Pergunta IA: ${text.trim().substring(0, 80)}`)

      // Handle UI actions from the AI agent
      if (result.uiActions && result.uiActions.length > 0) {
        for (const action of result.uiActions) {
          switch (action.type) {
            case 'refreshClientes':
            case 'refreshTarefas':
            case 'refreshPedidos':
              onRefreshData?.()
              break
            case 'startCall':
              if (action.payload?.phone) {
                window.open(`tel:${action.payload.phone}`, '_self')
                showToast?.('success', `📞 Ligação para ${action.payload.clienteNome || action.payload.phone}`)
              }
              break
          }
        }
      }
    } catch (err: any) {
      setAiError(err?.message || 'Erro ao conectar com a IA')
    } finally {
      setAiLoading(false)
    }
  }

  const handleAIKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(aiInput) }
  }

  // ─── WhatsApp Send ───

  const handleSendWA = async () => {
    if (!waText.trim() || !selectedCliente) return
    const chatNum = getWaChatNumber()
    if (!chatNum) { showToast?.('error', 'Cliente sem número de WhatsApp'); return }
    const msg = waText.trim()
    setWaText('')
    setWaSending(true)
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    setWaMessages(prev => [...prev, { id: Date.now(), text: msg, from: 'me', time: now }])
    const result = await sendUserWhatsApp(chatNum, msg, selectedCliente.id)
    if (result.success) {
      logAction('whatsapp', `WhatsApp para ${selectedCliente.razaoSocial}: ${msg.substring(0, 60)}`, selectedCliente.razaoSocial)
    } else {
      setWaMessages(prev => [...prev, { id: Date.now() + 1, text: '❌ ' + (result.error || 'Erro ao enviar'), from: 'system', time: now }])
      showToast?.('error', result.error || 'Erro ao enviar')
    }
    setWaSending(false)
  }

  const handleWaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWA() }
  }

  // ─── Email Send ───

  const handleSendEmail = async () => {
    if (!emailTo || !emailSubject || !emailBody) { showToast?.('error', 'Preencha todos os campos do email'); return }
    setEmailSending(true)
    const result = await sendEmailViaBot(emailTo, emailSubject, emailBody, selectedCliente?.id, loggedUser?.nome)
    if (result.success) {
      showToast?.('success', 'Email enviado!')
      logAction('email', `Email para ${emailTo}: ${emailSubject.substring(0, 60)}`, selectedCliente?.razaoSocial)
      setEmailSubject('')
      setEmailBody('')
    } else {
      showToast?.('error', result.error || 'Erro ao enviar email')
    }
    setEmailSending(false)
  }

  // ─── Save Note ───

  const handleSaveNote = async () => {
    if (!noteText.trim() || !selectedCliente) return
    try {
      await db.insertInteracao({
        clienteId: selectedCliente.id,
        tipo: 'nota',
        data: new Date().toISOString(),
        assunto: 'Observação (Workspace)',
        descricao: noteText.trim(),
        automatico: false,
      })
      showToast?.('success', 'Observação salva!')
      logAction('nota', `Observação em ${selectedCliente.razaoSocial}: ${noteText.trim().substring(0, 60)}`, selectedCliente.razaoSocial)
      setNoteText('')
    } catch {
      showToast?.('error', 'Erro ao salvar observação')
    }
  }

  // ─── Quick Task ───

  const handleQuickTask = () => {
    if (!quickTaskTitle.trim()) return
    const t: Tarefa = {
      id: Date.now(),
      titulo: quickTaskTitle.trim(),
      data: new Date().toISOString().split('T')[0],
      tipo: 'outro',
      status: 'pendente',
      prioridade: 'media',
      clienteId: selectedCliente?.id,
      vendedorId: loggedUser?.id,
    }
    onAddTarefa?.(t)
    logAction('tarefa', `Tarefa criada: ${quickTaskTitle.trim().substring(0, 60)}`, selectedCliente?.razaoSocial)
    showToast?.('success', 'Tarefa criada!')
    setQuickTaskTitle('')
  }

  // ─── Search ───

  const searchResults = searchQuery.trim().length >= 2
    ? clientes.filter(c => {
        const q = searchQuery.toLowerCase()
        return c.razaoSocial.toLowerCase().includes(q)
          || (c.nomeFantasia || '').toLowerCase().includes(q)
          || (c.cnpj || '').includes(q)
          || (c.contatoNome || '').toLowerCase().includes(q)
          || (c.contatoTelefone || '').includes(q)
      }).slice(0, 15)
    : []

  // ─── Sidebar tools config ───

  const tools = [
    { id: 'buscar' as SidebarTool, icon: MagnifyingGlassIcon, label: 'Buscar Cliente', color: 'text-blue-600' },
    { id: 'whatsapp' as SidebarTool, icon: WhatsAppIcon, label: 'WhatsApp', color: 'text-green-600' },
    { id: 'email' as SidebarTool, icon: EnvelopeIcon, label: 'Email', color: 'text-red-500' },
    { id: 'notas' as SidebarTool, icon: PencilSquareIcon, label: 'Observações', color: 'text-amber-600' },
    { id: 'tarefas' as SidebarTool, icon: CheckCircleIcon, label: 'Tarefa Rápida', color: 'text-purple-600' },
    { id: 'historico' as SidebarTool, icon: ClockIcon, label: 'Histórico', color: 'text-gray-600' },
  ]

  // ─── Render ───

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-700 to-blue-700 shadow-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🚀</span>
          <div>
            <h1 className="text-sm font-bold text-white">Workspace — {loggedUser?.nome || 'Vendedor'}</h1>
            {selectedCliente && (
              <p className="text-xs text-purple-200">
                Cliente: {selectedCliente.razaoSocial} • {selectedCliente.etapa}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-200 hidden sm:inline">
            {actions.length} ação(ões) registrada(s)
          </span>
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — Tools */}
        <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
              title={tool.label}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTool === tool.id
                  ? 'bg-purple-100 text-purple-700 shadow-sm'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tool.icon className="h-5 w-5" />
              <span className="text-[9px] font-medium leading-none">{tool.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Tool panel (expandable) */}
        {activeTool && (
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
            {/* Tool header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-800">
                {tools.find(t => t.id === activeTool)?.label}
              </h3>
              <button onClick={() => setActiveTool(null)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Tool content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* ── BUSCAR ── */}
              {activeTool === 'buscar' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Nome, CNPJ, telefone..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                  />
                  {searchResults.length > 0 ? (
                    <div className="space-y-1">
                      {searchResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCliente(c); setActiveTool(null) }}
                          className={`w-full text-left px-3 py-2 rounded-apple border transition-colors text-sm ${
                            selectedCliente?.id === c.id ? 'bg-purple-50 border-purple-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <p className="font-medium text-gray-900 truncate">{c.razaoSocial}</p>
                          <p className="text-xs text-gray-500 truncate">{c.contatoNome} • {c.etapa}</p>
                        </button>
                      ))}
                    </div>
                  ) : searchQuery.trim().length >= 2 ? (
                    <p className="text-xs text-gray-500 text-center py-4">Nenhum resultado</p>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">Digite pelo menos 2 caracteres</p>
                  )}

                  {selectedCliente && (
                    <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-apple">
                      <p className="text-xs font-semibold text-purple-800 mb-1">Cliente selecionado:</p>
                      <p className="text-sm font-medium text-gray-900">{selectedCliente.razaoSocial}</p>
                      <p className="text-xs text-gray-600">{selectedCliente.contatoNome} • {selectedCliente.contatoTelefone}</p>
                      <p className="text-xs text-gray-600">{selectedCliente.contatoEmail}</p>
                      <p className="text-xs text-gray-500 mt-1">Etapa: {selectedCliente.etapa} | Score: {selectedCliente.score || 0}</p>
                      <button onClick={() => setSelectedCliente(null)} className="text-xs text-red-500 underline mt-2">Remover seleção</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── WHATSAPP CHAT ── */}
              {activeTool === 'whatsapp' && (
                <div className="flex flex-col h-full">
                  {!selectedCliente ? (
                    <div className="text-center py-6">
                      <WhatsAppIcon variant="filled" className="h-8 w-8 mx-auto mb-2 opacity-60" />
                      <p className="text-sm text-gray-500">Selecione um cliente primeiro</p>
                      <button onClick={() => setActiveTool('buscar')} className="text-xs text-purple-600 underline mt-1">Buscar cliente</button>
                    </div>
                  ) : !waConnected ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-orange-600 mb-2">WhatsApp não conectado</p>
                      <p className="text-xs text-gray-500">Conecte seu WhatsApp em Tarefas → 📱 Meu WhatsApp</p>
                    </div>
                  ) : (
                    <>
                      {/* Chat header */}
                      <div className="px-3 py-2 bg-green-50 border-b border-green-200 flex-shrink-0 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-green-800 font-semibold truncate">{selectedCliente.razaoSocial}</p>
                          <p className="text-[10px] text-green-600">{selectedCliente.whatsapp || selectedCliente.contatoCelular || selectedCliente.contatoTelefone}</p>
                        </div>
                        <button
                          onClick={startCall}
                          disabled={callStatus === 'recording'}
                          className="p-1.5 text-green-700 hover:bg-green-200 rounded-full transition-colors disabled:opacity-40 flex-shrink-0"
                          title="Ligar (via Vincular Telefone) com gravação"
                        >
                          <PhoneIcon className="h-5 w-5" />
                        </button>
                      </div>

                      {/* In-call / recording overlay */}
                      {callStatus !== 'idle' && (
                        <div className={`px-3 py-3 border-b flex-shrink-0 ${
                          callStatus === 'recording' ? 'bg-green-100 border-green-300' :
                          callStatus === 'error' ? 'bg-red-50 border-red-200' :
                          'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center gap-3">
                            {/* Status indicator */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              callStatus === 'recording' ? 'bg-red-500 animate-pulse' :
                              callStatus === 'error' ? 'bg-red-500' :
                              'bg-gray-400'
                            }`}>
                              <PhoneIcon className="h-4 w-4 text-white" />
                            </div>

                            {/* Call info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900">
                                {callStatus === 'recording' ? '🔴 Gravando ligação...' :
                                 callStatus === 'ended' ? 'Ligação encerrada' :
                                 'Erro na gravação'}
                              </p>
                              {callStatus === 'recording' && (
                                <p className="text-[11px] font-mono text-green-700">
                                  {Math.floor(callDuration / 60).toString().padStart(2, '0')}:{(callDuration % 60).toString().padStart(2, '0')}
                                </p>
                              )}
                              {callStatus === 'ended' && callDuration > 0 && (
                                <p className="text-[10px] text-gray-500">
                                  Duração: {Math.floor(callDuration / 60)}m {callDuration % 60}s
                                  {callSaving ? ' • Salvando...' : callRecordingUrl ? ' • Gravação salva ✅' : ''}
                                </p>
                              )}
                              {callStatus === 'error' && callError && (
                                <p className="text-[10px] text-red-600 truncate">{callError}</p>
                              )}
                            </div>

                            {/* Call actions */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {callStatus === 'recording' && (
                                <button
                                  onClick={endCall}
                                  className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                                  title="Encerrar e salvar gravação"
                                >
                                  <PhoneXMarkIcon className="h-4 w-4" />
                                </button>
                              )}
                              {callStatus === 'ended' && callRecordingUrl && (
                                <a
                                  href={callRecordingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded-full hover:bg-blue-700 transition-colors"
                                >
                                  Ouvir gravação
                                </a>
                              )}
                              {(callStatus === 'ended' || callStatus === 'error') && (
                                <button
                                  onClick={dismissCall}
                                  className="p-1 text-gray-400 hover:text-gray-600"
                                  title="Fechar"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Messages area */}
                      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 bg-[#e5ddd5] min-h-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'a\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M0 20h40M20 0v40\' stroke=\'%23d4cfc4\' stroke-width=\'.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%23e5ddd5\'/%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'url(%23a)\'/%3E%3C/svg%3E")' }}>
                        {waChatLoading ? (
                          <div className="text-center py-4">
                            <div className="inline-block animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                            <p className="text-[10px] text-gray-500 mt-1">Carregando mensagens...</p>
                          </div>
                        ) : waMessages.length === 0 ? (
                          <div className="text-center py-4">
                            <p className="text-xs text-gray-500 bg-white/80 inline-block px-3 py-1 rounded-full">Nenhuma mensagem ainda</p>
                          </div>
                        ) : (
                          waMessages.map((m, i) => (
                            <div key={`${m.id}-${i}`} className={`flex ${m.from === 'me' ? 'justify-end' : m.from === 'system' ? 'justify-center' : 'justify-start'}`}>
                              {m.from === 'system' ? (
                                <div className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full max-w-[90%]">{m.text}</div>
                              ) : (
                                <div className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs shadow-sm ${m.from === 'me' ? 'bg-[#dcf8c6] text-gray-900' : 'bg-white text-gray-900'}`}>
                                  {/* Image */}
                                  {m.type === 'image' && m.mediaUrl ? (
                                    <div>
                                      <img src={m.mediaUrl} alt="Imagem" className="max-w-full rounded-md max-h-[240px] object-contain cursor-pointer" onClick={() => window.open(m.mediaUrl, '_blank')} />
                                      {m.text && m.text !== '📷 Imagem' && <p className="whitespace-pre-wrap break-words leading-relaxed mt-1">{m.text}</p>}
                                    </div>
                                  ) : m.type === 'image' ? (
                                    <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-500 italic">{m.text || '📷 Imagem'}</p>
                                  ) : null}
                                  {/* Audio */}
                                  {m.type === 'audio' && m.mediaUrl ? (
                                    <div>
                                      <audio controls preload="none" className="max-w-full h-8" style={{ minWidth: '180px' }}>
                                        <source src={m.mediaUrl} type={m.mimetype || 'audio/ogg'} />
                                      </audio>
                                    </div>
                                  ) : m.type === 'audio' ? (
                                    <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-500 italic">{m.text || '🎤 Áudio'}</p>
                                  ) : null}
                                  {/* Video */}
                                  {m.type === 'video' && m.mediaUrl ? (
                                    <div>
                                      <video controls preload="none" className="max-w-full rounded-md max-h-[200px]">
                                        <source src={m.mediaUrl} type={m.mimetype || 'video/mp4'} />
                                      </video>
                                      {m.text && m.text !== '🎥 Vídeo' && <p className="whitespace-pre-wrap break-words leading-relaxed mt-1">{m.text}</p>}
                                    </div>
                                  ) : m.type === 'video' ? (
                                    <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-500 italic">{m.text || '🎥 Vídeo'}</p>
                                  ) : null}
                                  {/* Document */}
                                  {m.type === 'document' ? (
                                    m.mediaUrl ? (
                                      <a href={m.mediaUrl} download className="flex items-center gap-1.5 text-blue-600 hover:underline">
                                        <span>📎</span><span>{m.text}</span>
                                      </a>
                                    ) : (
                                      <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-500 italic">{m.text}</p>
                                    )
                                  ) : null}
                                  {/* Sticker */}
                                  {m.type === 'sticker' && m.mediaUrl ? (
                                    <img src={m.mediaUrl} alt="Sticker" className="max-w-[120px] max-h-[120px]" />
                                  ) : m.type === 'sticker' ? (
                                    <p className="text-2xl">{m.text}</p>
                                  ) : null}
                                  {/* Text / other */}
                                  {(!m.type || m.type === 'text' || m.type === 'other') && (
                                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                                  )}
                                  <p className={`text-[9px] mt-0.5 ${m.from === 'me' ? 'text-green-700' : 'text-gray-400'} text-right`}>{m.time}</p>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                        <div ref={waChatEndRef} />
                      </div>

                      {/* Voice recording bar */}
                      {(isRecordingVoice || voiceAudioUrl) && (
                        <div className="px-3 py-2 bg-red-50 border-t border-red-200 flex items-center gap-2 flex-shrink-0">
                          {isRecordingVoice ? (
                            <>
                              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                              <span className="text-xs text-red-700 font-mono flex-1">{Math.floor(voiceSeconds / 60).toString().padStart(2, '0')}:{(voiceSeconds % 60).toString().padStart(2, '0')}</span>
                              <button onClick={stopVoiceRecording} className="p-1 bg-red-600 text-white rounded-full" title="Parar"><StopIcon className="h-4 w-4" /></button>
                              <button onClick={cancelVoiceRecording} className="p-1 text-red-600 hover:bg-red-100 rounded-full" title="Cancelar"><TrashIcon className="h-4 w-4" /></button>
                            </>
                          ) : voiceAudioUrl ? (
                            <>
                              <audio src={voiceAudioUrl} controls className="flex-1 h-8" style={{ maxHeight: 32 }} />
                              <button onClick={sendVoiceMessage} disabled={waSending} className="p-1.5 bg-green-600 text-white rounded-full disabled:opacity-50" title="Enviar áudio"><PaperAirplaneIcon className="h-4 w-4" /></button>
                              <button onClick={cancelVoiceRecording} className="p-1 text-red-600 hover:bg-red-100 rounded-full" title="Descartar"><TrashIcon className="h-4 w-4" /></button>
                            </>
                          ) : null}
                        </div>
                      )}

                      {/* Hidden image input */}
                      <input type="file" ref={waImageInputRef} accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWaImageSend(f); e.target.value = '' }} />

                      {/* Input bar */}
                      {!isRecordingVoice && !voiceAudioUrl && (
                        <div className="px-2 py-2 border-t border-gray-200 bg-gray-50 flex items-end gap-1.5 flex-shrink-0">
                          <button onClick={() => waImageInputRef.current?.click()} disabled={waSending} className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors flex-shrink-0" title="Enviar foto">
                            <PhotoIcon className="h-5 w-5" />
                          </button>
                          <textarea
                            value={waText}
                            onChange={e => setWaText(e.target.value)}
                            onKeyDown={handleWaKeyDown}
                            placeholder="Mensagem..."
                            rows={1}
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-2xl text-xs resize-none focus:outline-none focus:ring-1 focus:ring-green-500 max-h-20"
                            style={{ minHeight: 32 }}
                          />
                          {waText.trim() ? (
                            <button onClick={handleSendWA} disabled={waSending} className="p-1.5 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 flex-shrink-0 transition-colors" title="Enviar">
                              <PaperAirplaneIcon className="h-5 w-5" />
                            </button>
                          ) : (
                            <button onClick={startVoiceRecording} disabled={waSending} className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-full flex-shrink-0 transition-colors" title="Gravar áudio">
                              <MicrophoneIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── EMAIL ── */}
              {activeTool === 'email' && (
                <div className="space-y-3">
                  {!selectedCliente ? (
                    <div className="text-center py-6">
                      <EnvelopeIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Selecione um cliente primeiro</p>
                      <button onClick={() => setActiveTool('buscar')} className="text-xs text-purple-600 underline mt-1">Buscar cliente</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="email"
                        value={emailTo}
                        onChange={e => setEmailTo(e.target.value)}
                        placeholder="Email destino"
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={e => setEmailSubject(e.target.value)}
                        placeholder="Assunto"
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        placeholder="Corpo do email..."
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSendEmail}
                        disabled={emailSending || !emailTo || !emailSubject || !emailBody}
                        className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-apple font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {emailSending ? 'Enviando...' : 'Enviar Email'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── NOTAS ── */}
              {activeTool === 'notas' && (
                <div className="space-y-3">
                  {!selectedCliente ? (
                    <div className="text-center py-6">
                      <PencilSquareIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Selecione um cliente para adicionar observações</p>
                      <button onClick={() => setActiveTool('buscar')} className="text-xs text-purple-600 underline mt-1">Buscar cliente</button>
                    </div>
                  ) : (
                    <>
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-apple">
                        <p className="text-xs text-amber-800">Observação para: <strong>{selectedCliente.razaoSocial}</strong></p>
                      </div>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Digite sua observação..."
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={handleSaveNote}
                        disabled={!noteText.trim()}
                        className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-apple font-semibold text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
                      >
                        Salvar Observação
                      </button>

                      {/* Recent notes for this client */}
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Notas recentes:</p>
                        {interacoes.filter(i => i.clienteId === selectedCliente.id && i.tipo === 'nota').slice(0, 5).map(i => (
                          <div key={i.id} className="p-2 mb-1 bg-gray-50 border border-gray-200 rounded text-xs">
                            <p className="text-gray-700">{i.descricao}</p>
                            <p className="text-gray-400 mt-0.5">{new Date(i.data).toLocaleDateString('pt-BR')}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── TAREFAS RÁPIDAS ── */}
              {activeTool === 'tarefas' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={quickTaskTitle}
                    onChange={e => setQuickTaskTitle(e.target.value)}
                    placeholder="Título da tarefa..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyDown={e => { if (e.key === 'Enter') handleQuickTask() }}
                  />
                  {selectedCliente && (
                    <p className="text-xs text-gray-500">Vinculada a: {selectedCliente.razaoSocial}</p>
                  )}
                  <button
                    onClick={handleQuickTask}
                    disabled={!quickTaskTitle.trim()}
                    className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-apple font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Criar Tarefa
                  </button>

                  {/* Tarefas pendentes do vendedor */}
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Suas tarefas pendentes:</p>
                    {tarefas
                      .filter(t => t.status === 'pendente' && (!t.vendedorId || t.vendedorId === loggedUser?.id))
                      .slice(0, 8)
                      .map(t => {
                        const cl = t.clienteId ? clientes.find(c => c.id === t.clienteId) : null
                        return (
                          <div key={t.id} className="flex items-center gap-2 p-2 mb-1 bg-gray-50 border border-gray-200 rounded text-xs">
                            <button
                              onClick={() => {
                                onUpdateTarefa?.({ ...t, status: 'concluida' })
                                logAction('tarefa', `Tarefa concluída: ${t.titulo.substring(0, 60)}`, cl?.razaoSocial)
                                showToast?.('success', 'Tarefa concluída!')
                              }}
                              className="text-green-500 hover:text-green-700 flex-shrink-0"
                            >
                              <CheckCircleIcon className="h-4 w-4" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-800 truncate">{t.titulo}</p>
                              {cl && <p className="text-gray-400 truncate">{cl.razaoSocial}</p>}
                            </div>
                            {cl && (
                              <button
                                onClick={() => { setSelectedCliente(cl); setActiveTool(null) }}
                                className="text-purple-500 hover:text-purple-700 flex-shrink-0"
                                title="Selecionar cliente"
                              >
                                <ChevronRightIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* ── HISTÓRICO ── */}
              {activeTool === 'historico' && (
                <div className="space-y-2">
                  {actions.length === 0 ? (
                    <div className="text-center py-8">
                      <ClockIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Nenhuma ação registrada ainda</p>
                      <p className="text-xs text-gray-400 mt-1">Use as ferramentas para registrar atividades</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-2">{actions.length} ação(ões) nesta sessão</p>
                      {actions.map(a => (
                        <div key={a.id} className="flex items-start gap-2 p-2 bg-gray-50 border border-gray-200 rounded-apple">
                          <span className="text-sm flex-shrink-0">
                            {a.tipo === 'whatsapp' ? '📱' : a.tipo === 'email' ? '📧' : a.tipo === 'nota' ? '📝' : a.tipo === 'tarefa' ? '✅' : a.tipo === 'ia' ? '🤖' : '📋'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-800">{a.descricao}</p>
                            {a.clienteNome && <p className="text-[10px] text-gray-500">Cliente: {a.clienteNome}</p>}
                            <p className="text-[10px] text-gray-400">{a.timestamp}</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center — AI Chat */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-sm">🤖</span>
              </div>
              <p className="text-sm font-semibold text-white">Assistente IA — Workspace</p>
            </div>
            <button
              onClick={() => {
                setMessages([{
                  id: '0', role: 'assistant',
                  text: `Conversa limpa! 🔄 Os dados continuam carregados. Manda aí, ${loggedUser?.nome?.split(' ')[0] || ''}!`,
                  timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                }])
                clearConversation('workspace').catch(() => {})
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-apple transition-colors"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Limpar
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                    <span className="text-sm">🤖</span>
                  </div>
                )}
                <div className={`max-w-[80%] group relative`}>
                  <div className={`px-4 py-3 rounded-apple shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-none'
                      : 'bg-gray-50 border border-gray-200 rounded-bl-none'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div className="space-y-1">{renderMarkdown(msg.text)}</div>
                    )}
                  </div>
                  <div className={`flex items-center gap-2 mt-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] text-gray-400">{msg.timestamp}</span>
                    {msg.role === 'assistant' && msg.id !== '0' && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(msg.text); showToast?.('success', 'Copiado!') }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                      >
                        <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 ml-2 mt-1">
                    <span className="text-sm">👤</span>
                  </div>
                )}
              </div>
            ))}

            {aiLoading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                  <span className="text-sm">🤖</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-apple rounded-bl-none px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {aiError && (
              <div className="mx-auto max-w-md bg-red-50 border border-red-200 rounded-apple px-4 py-3 text-center">
                <p className="text-sm text-red-700">⚠️ {aiError}</p>
                <button onClick={() => setAiError(null)} className="text-xs text-red-500 underline mt-1">Fechar</button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0">
            {selectedCliente && (
              <button
                onClick={() => sendAIMessage(`Analise o cliente ${selectedCliente.razaoSocial} e sugira os próximos passos`)}
                disabled={aiLoading}
                className="flex-shrink-0 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-100 disabled:opacity-50"
              >
                Analisar {selectedCliente.razaoSocial.split(' ')[0]}
              </button>
            )}
            <button
              onClick={() => sendAIMessage('Quais clientes preciso contatar hoje com urgência?')}
              disabled={aiLoading}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-100 disabled:opacity-50"
            >
              Contatos urgentes
            </button>
            <button
              onClick={() => sendAIMessage('Gere um resumo do meu pipeline e sugira ações')}
              disabled={aiLoading}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-100 disabled:opacity-50"
            >
              Resumo pipeline
            </button>
            <button
              onClick={() => sendAIMessage('Quais são os leads com maior potencial de conversão?')}
              disabled={aiLoading}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-100 disabled:opacity-50"
            >
              Leads quentes
            </button>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={handleAIKeyDown}
                disabled={aiLoading}
                rows={1}
                placeholder="Pergunte à IA sobre seus clientes, peça análises, sugira ações..."
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-apple text-sm focus:outline-none focus:border-purple-500 resize-none transition-colors disabled:opacity-50 bg-white"
                style={{ minHeight: '42px', maxHeight: '120px' }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
              />
              <button
                onClick={() => sendAIMessage(aiInput)}
                disabled={!aiInput.trim() || aiLoading}
                className="flex-shrink-0 w-11 h-11 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-40 text-white rounded-apple transition-all flex items-center justify-center shadow-sm"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar — Client context + Session actions */}
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0 hidden xl:flex">
          {/* Selected client info */}
          <div className="p-4 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Cliente Ativo</p>
            {selectedCliente ? (
              <div>
                <p className="text-sm font-bold text-gray-900">{selectedCliente.razaoSocial}</p>
                {selectedCliente.nomeFantasia && <p className="text-xs text-gray-500">{selectedCliente.nomeFantasia}</p>}
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-600">📍 {selectedCliente.etapa}</p>
                  <p className="text-xs text-gray-600">⭐ Score: {selectedCliente.score || 0}</p>
                  <p className="text-xs text-gray-600">📅 Inativo: {selectedCliente.diasInativo || 0} dias</p>
                  {selectedCliente.contatoNome && <p className="text-xs text-gray-600">👤 {selectedCliente.contatoNome}</p>}
                  {selectedCliente.contatoTelefone && <p className="text-xs text-gray-600">📞 {selectedCliente.contatoTelefone}</p>}
                  {selectedCliente.contatoEmail && <p className="text-xs text-gray-600">📧 {selectedCliente.contatoEmail}</p>}
                  {selectedCliente.valorEstimado && <p className="text-xs text-gray-600">💰 R$ {selectedCliente.valorEstimado.toLocaleString('pt-BR')}</p>}
                </div>
                <div className="flex gap-1 mt-3">
                  <button onClick={() => setActiveTool('whatsapp')} className="flex-1 px-2 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 inline-flex items-center justify-center gap-1"><WhatsAppIcon variant="outline" className="h-3 w-3" /> WA</button>
                  <button onClick={() => setActiveTool('email')} className="flex-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">📧 Email</button>
                  <button onClick={() => setActiveTool('notas')} className="flex-1 px-2 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100">📝 Nota</button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <UserGroupIcon className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">Nenhum selecionado</p>
                <button onClick={() => setActiveTool('buscar')} className="text-xs text-purple-600 underline mt-1">Buscar</button>
              </div>
            )}
          </div>

          {/* Session actions log */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Ações desta sessão ({actions.length})
            </p>
            {actions.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhuma ação ainda</p>
            ) : (
              <div className="space-y-1.5">
                {actions.slice(0, 20).map(a => (
                  <div key={a.id} className="flex items-start gap-1.5 text-xs">
                    <span className="flex-shrink-0 mt-0.5">
                      {a.tipo === 'whatsapp' ? '📱' : a.tipo === 'email' ? '📧' : a.tipo === 'nota' ? '📝' : a.tipo === 'tarefa' ? '✅' : a.tipo === 'ia' ? '🤖' : '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 truncate">{a.descricao.replace('[Workspace] ', '').substring(0, 50)}</p>
                      <p className="text-[10px] text-gray-400">{a.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="p-3 border-t border-gray-100 bg-gray-50 space-y-1 flex-shrink-0">
            <p className="text-[10px] text-gray-400 font-semibold uppercase">Dados CRM</p>
            <div className="flex justify-between text-xs text-gray-600">
              <span>👥 Clientes</span><span className="font-bold">{clientes.length}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>📋 Tarefas</span><span className="font-bold">{tarefas.filter(t => t.status === 'pendente').length} pendentes</span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>🛒 Pedidos</span><span className="font-bold">{pedidos.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Workspace
