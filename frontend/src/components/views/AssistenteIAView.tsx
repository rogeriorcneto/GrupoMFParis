import React, { useState, useRef, useEffect, useCallback } from 'react'
import { PaperAirplaneIcon, ArrowPathIcon, ClipboardDocumentIcon, PhotoIcon, MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { Cliente, Pedido, Vendedor, Interacao, Produto } from '../../types'
import type { Tarefa } from '../../types'
import { callAIFull, buildCRMContext } from '../../lib/gemini'
import type { AIMessage, AIUIAction, AIAttachment } from '../../lib/gemini'
import { loadConversation, saveConversation, clearConversation } from '../../lib/aiConversations'
import { fetchAIContextData, type AIContextData } from '../../lib/botApi'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  attachments?: AIAttachment[]
}

interface AssistenteIAViewProps {
  clientes: Cliente[]
  pedidos: Pedido[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  produtos: Produto[]
  tarefas: Tarefa[]
  loggedUser: Vendedor
  onRefreshData?: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

const PROMPT_CATEGORIES = [
  {
    label: '📊 Relatórios',
    prompts: [
      'Gere um relatório 360° completo: funil, WhatsApp, ligações, pedidos e sugestões',
      'Quais são os clientes mais valiosos em carteira?',
      'Qual é a taxa de conversão por etapa do funil?',
      'Mostre o desempenho de cada vendedor com dados de comunicação',
    ],
  },
  {
    label: '📱 WhatsApp',
    prompts: [
      'Analise as mensagens de WhatsApp recentes e identifique oportunidades',
      'Quais clientes responderam no WhatsApp mas não tiveram follow-up?',
      'Resuma as conversas mais recentes do WhatsApp',
      'Quais clientes estão mais engajados no WhatsApp?',
    ],
  },
  {
    label: '📞 Ligações',
    prompts: [
      'Resuma as ligações gravadas recentes e extraia insights',
      'Quais foram as principais objeções identificadas nas ligações?',
      'Liste as ligações com transcrição e analise o sentimento',
      'Quais clientes precisam de uma ligação de follow-up?',
    ],
  },
  {
    label: '🎯 Estratégia',
    prompts: [
      'Quais são os 5 clientes mais próximos de fechar negócio?',
      'Sugira uma estratégia de follow-up baseada nos dados de WhatsApp e ligações',
      'Analise o pipeline e projete o faturamento do mês',
      'Cruze dados de WhatsApp, ligações e funil para sugerir próximos passos',
    ],
  },
]

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="font-bold text-gray-900 mt-3 mb-1 text-sm">{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-gray-900 mt-4 mb-1 text-base">{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={i} className="font-bold text-gray-900 mt-4 mb-2 text-lg">{line.slice(2)}</h1>
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.slice(2)
      return <li key={i} className="ml-4 text-sm text-gray-700 list-disc">{renderInline(content)}</li>
    }
    if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, '')
      return <li key={i} className="ml-4 text-sm text-gray-700 list-decimal">{renderInline(content)}</li>
    }
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

export default function AssistenteIAView({ clientes, pedidos, vendedores, interacoes, produtos, tarefas, loggedUser, onRefreshData, showToast }: AssistenteIAViewProps) {
  const welcomeMsg: ChatMessage = {
    id: '0',
    role: 'assistant',
    text: `E aí, ${loggedUser.nome.split(' ')[0]}! 👋\n\nTenho aqui os dados completos do CRM — **${clientes.length} clientes**, **${pedidos.length} pedidos**, **${vendedores.length} vendedores** + mensagens de WhatsApp, ligações e produtos.\n\nPode perguntar qualquer coisa: relatórios, análise de WhatsApp, transcrições de ligações, estratégias baseadas em dados reais.`,
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMsg])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [extraData, setExtraData] = useState<AIContextData | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<AIAttachment[]>([])
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [audioSeconds, setAudioSeconds] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch extra AI context data (WhatsApp msgs, calls, etc.) on mount
  useEffect(() => {
    fetchAIContextData().then(data => setExtraData(data)).catch(() => {})
  }, [])

  // Load saved conversation on mount
  useEffect(() => {
    loadConversation('assistente').then(saved => {
      if (saved.length > 0) {
        setMessages([welcomeMsg, ...saved])
      }
      setConversationLoaded(true)
    }).catch(() => setConversationLoaded(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save conversation when messages change (skip welcome msg)
  useEffect(() => {
    if (!conversationLoaded) return
    const toSave = messages.filter(m => m.id !== '0')
    if (toSave.length > 0) {
      saveConversation('assistente', toSave).catch(() => {})
    }
  }, [messages, conversationLoaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const systemPrompt = buildCRMContext({
    clientes, pedidos, vendedores,
    interacoes: [], // interacoes individuais nao sao enviadas para evitar payload gigante
    loggedUser,
    whatsappMessages: extraData?.whatsappMessages,
    callRecordings: extraData?.callRecordings,
    produtos: extraData?.produtos || produtos,
    tarefas: extraData?.tarefas || tarefas,
  })

  const handleUIActions = (actions: AIUIAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case 'refreshClientes':
        case 'refreshTarefas':
        case 'refreshPedidos':
          onRefreshData?.()
          break
        case 'startCall':
          if (action.payload?.phone) {
            window.open(`tel:${action.payload.phone}`, '_self')
            showToast?.('success', `📞 Ligação iniciada para ${action.payload.clienteNome || action.payload.phone}`)
          }
          break
        case 'navigateTo':
          // Could dispatch navigation events in the future
          break
      }
    }
  }

  // File handling helpers
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setError('Imagem muito grande (máx 8MB)'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      const mimeType = file.type || 'image/jpeg'
      setPendingAttachments(prev => [...prev, { mimeType, data: base64, name: file.name }])
    }
    reader.readAsDataURL(file)
    e.target.value = '' // reset input
  }, [])

  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setError('Áudio muito grande (máx 8MB)'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      const mimeType = file.type || 'audio/webm'
      setPendingAttachments(prev => [...prev, { mimeType, data: base64, name: file.name }])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          setPendingAttachments(prev => [...prev, { mimeType: blob.type, data: base64, name: `gravacao_${Date.now()}.webm` }])
        }
        reader.readAsDataURL(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start(1000)
      setIsRecordingAudio(true)
      setAudioSeconds(0)
      audioTimerRef.current = setInterval(() => setAudioSeconds(s => s + 1), 1000)
    } catch {
      setError('Permissão do microfone negada')
    }
  }, [])

  const stopAudioRecording = useCallback(() => {
    if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecordingAudio(false)
    setAudioSeconds(0)
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  const sendMessage = async (text: string) => {
    if ((!text.trim() && pendingAttachments.length === 0) || loading) return
    setError(null)

    const attachments = [...pendingAttachments]
    const displayText = text.trim() || (attachments.length > 0 ? attachments.map(a => a.mimeType.startsWith('image') ? '📷 Imagem' : '🎤 Áudio').join(' + ') : '')

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: displayText,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      attachments,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setPendingAttachments([])
    setLoading(true)

    try {
      // Build history without attachments for older messages (to keep payload small)
      // Limit to last 10 messages to avoid token overflow
      const history: AIMessage[] = messages
        .filter(m => m.id !== '0')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.text }))
      // Current message with attachments
      const userContent = text.trim() || (attachments.some(a => a.mimeType.startsWith('image')) ? 'Analise esta imagem.' : 'Transcreva e analise este áudio.')
      history.push({ role: 'user', content: userContent, attachments })

      const result = await callAIFull(history, systemPrompt)

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: result.response,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, aiMsg])

      // Handle UI actions from the AI agent
      if (result.uiActions && result.uiActions.length > 0) {
        handleUIActions(result.uiActions)
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao conectar com a IA. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const copyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const clearChat = () => {
    setMessages([{
      id: '0',
      role: 'assistant',
      text: `Conversa limpa, ${loggedUser.nome.split(' ')[0]}! 🔄 Os dados continuam carregados — **${clientes.length} clientes**, **${pedidos.length} pedidos**, **${vendedores.length} vendedores**. Manda aí!`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }])
    setError(null)
    clearConversation('assistente').catch(() => {})
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar de prompts */}
      <div className="hidden lg:flex flex-col w-72 flex-shrink-0 bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
          <h3 className="text-sm font-semibold text-white">💡 Prompts Sugeridos</h3>
          <p className="text-xs text-purple-200 mt-0.5">Clique para usar</p>
        </div>
        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 p-3 border-b border-gray-100">
          {PROMPT_CATEGORIES.map((cat, i) => (
            <button
              key={i}
              onClick={() => setActiveCategory(i)}
              className={`px-2 py-1 text-xs rounded-apple font-medium transition-colors ${activeCategory === i ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        {/* Prompts list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {PROMPT_CATEGORIES[activeCategory].prompts.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p)}
              disabled={loading}
              className="w-full text-left px-3 py-2.5 text-xs text-gray-700 bg-gray-50 hover:bg-purple-50 hover:text-purple-700 border border-gray-200 hover:border-purple-200 rounded-apple transition-colors disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
        {/* Stats mini */}
        <div className="p-3 border-t border-gray-100 bg-gray-50 space-y-1">
          <p className="text-[10px] text-gray-400 font-semibold uppercase">Dados carregados</p>
          <div className="flex justify-between text-xs text-gray-600">
            <span>👥 Clientes</span><span className="font-bold">{clientes.length}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>🛒 Pedidos</span><span className="font-bold">{pedidos.length}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>👤 Vendedores</span><span className="font-bold">{vendedores.length}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>📱 Msgs WA</span><span className="font-bold">{extraData?.whatsappMessages?.length || '...'}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>📞 Ligações</span><span className="font-bold">{extraData?.callRecordings?.length || '...'}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>📦 Produtos</span><span className="font-bold">{(extraData?.produtos || produtos).length}</span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-lg">🤖</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Assistente IA — Grupo MF Paris</p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-apple transition-colors"
            title="Nova conversa"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Nova conversa
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                  <span className="text-sm">🤖</span>
                </div>
              )}
              <div className={`max-w-[75%] group relative ${msg.role === 'user' ? 'order-last' : ''}`}>
                <div className={`px-4 py-3 rounded-apple shadow-sm ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-gray-50 border border-gray-200 rounded-bl-none'}`}>
                  {/* Attachment previews */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att, ai) => (
                        att.mimeType.startsWith('image') ? (
                          <img key={ai} src={`data:${att.mimeType};base64,${att.data}`} alt="" className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-white/20" />
                        ) : att.mimeType.startsWith('audio') ? (
                          <div key={ai} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${msg.role === 'user' ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-700 border border-purple-200'}`}>
                            🎤 {att.name || 'Áudio'}
                          </div>
                        ) : null
                      ))}
                    </div>
                  )}
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div className="space-y-1">{renderMarkdown(msg.text)}</div>
                  )}
                </div>
                <div className={`flex items-center gap-2 mt-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] text-gray-400">{msg.timestamp}</span>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => copyMessage(msg.id, msg.text)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                      title="Copiar resposta"
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {copied === msg.id && <span className="text-[10px] text-green-500">Copiado!</span>}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 ml-2 mt-1">
                  <span className="text-sm">👤</span>
                </div>
              )}
            </div>
          ))}

          {loading && (
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

          {error && (
            <div className="mx-auto max-w-md bg-red-50 border border-red-200 rounded-apple px-4 py-3 text-center">
              <p className="text-sm text-red-700">⚠️ {error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-500 underline mt-1">Fechar</button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Prompts rápidos mobile */}
        <div className="lg:hidden px-4 pb-2 flex gap-2 overflow-x-auto">
          {PROMPT_CATEGORIES[0].prompts.slice(0, 3).map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p)}
              disabled={loading}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
            >
              {p.length > 30 ? p.slice(0, 30) + '…' : p}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          {/* Hidden file inputs */}
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioSelect} />

          {/* Pending attachments preview */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.mimeType.startsWith('image') ? (
                    <img src={`data:${att.mimeType};base64,${att.data}`} alt="" className="h-16 w-16 rounded-lg object-cover border border-gray-300" />
                  ) : (
                    <div className="h-16 px-3 flex items-center gap-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-medium">
                      🎤 {att.name || 'Áudio'}
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Audio recording indicator */}
          {isRecordingAudio && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-apple">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-700 font-medium">Gravando... {Math.floor(audioSeconds / 60).toString().padStart(2, '0')}:{(audioSeconds % 60).toString().padStart(2, '0')}</span>
              <button onClick={stopAudioRecording} className="ml-auto px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-apple hover:bg-red-600 transition-colors">⏹ Parar</button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            {/* Attachment buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={loading || isRecordingAudio}
                className="w-9 h-9 flex items-center justify-center rounded-apple border border-gray-300 bg-white text-gray-500 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 disabled:opacity-40 transition-colors"
                title="Enviar imagem"
              >
                <PhotoIcon className="h-4.5 w-4.5" />
              </button>
              <button
                onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
                disabled={loading}
                className={`w-9 h-9 flex items-center justify-center rounded-apple border transition-colors ${
                  isRecordingAudio
                    ? 'bg-red-500 border-red-500 text-white animate-pulse'
                    : 'border-gray-300 bg-white text-gray-500 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 disabled:opacity-40'
                }`}
                title={isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}
              >
                <MicrophoneIcon className="h-4.5 w-4.5" />
              </button>
            </div>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
              placeholder="Pergunte sobre seus clientes, pedidos, funil... (Enter para enviar, Shift+Enter para nova linha)"
              className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-apple text-sm focus:outline-none focus:border-purple-500 resize-none transition-colors disabled:opacity-50 bg-white"
              style={{ minHeight: '42px', maxHeight: '120px' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={(!input.trim() && pendingAttachments.length === 0) || loading}
              className="flex-shrink-0 w-11 h-11 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-apple transition-all flex items-center justify-center shadow-sm"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Rogério Cassiano · Software Engineer · Os dados do CRM são processados a cada mensagem
          </p>
        </div>
      </div>
    </div>
  )
}
