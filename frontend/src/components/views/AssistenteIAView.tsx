import React, { useState, useRef, useEffect } from 'react'
import { PaperAirplaneIcon, ArrowPathIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import type { Cliente, Pedido, Vendedor, Interacao } from '../../types'
import { callAI, buildCRMContext } from '../../lib/gemini'
import type { AIMessage } from '../../lib/gemini'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

interface AssistenteIAViewProps {
  clientes: Cliente[]
  pedidos: Pedido[]
  vendedores: Vendedor[]
  interacoes: Interacao[]
  loggedUser: Vendedor
}

const PROMPT_CATEGORIES = [
  {
    label: '📊 Relatórios',
    prompts: [
      'Gere um relatório completo do funil de vendas atual',
      'Quais são os clientes mais valiosos em carteira?',
      'Qual é a taxa de conversão por etapa do funil?',
      'Mostre o desempenho de cada vendedor',
    ],
  },
  {
    label: '⚠️ Alertas',
    prompts: [
      'Quais clientes estão inativos há mais de 30 dias?',
      'Quais clientes têm prazo de cotação vencendo?',
      'Liste os pedidos aguardando aprovação',
      'Quais leads estão com score baixo e precisam de atenção?',
    ],
  },
  {
    label: '🎯 Estratégia',
    prompts: [
      'Quais são os 5 clientes mais próximos de fechar negócio?',
      'Sugira uma estratégia de follow-up para os clientes em negociação',
      'Quais clientes em homologado devem ser priorizados para cotação?',
      'Analise o pipeline e projete o faturamento do mês',
    ],
  },
  {
    label: '🔍 Busca',
    prompts: [
      'Encontre todos os clientes do estado de São Paulo',
      'Quais clientes foram perdidos nos últimos 60 dias?',
      'Liste os clientes por cidade com maior concentração',
      'Mostre todos os clientes sem interação recente',
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

export default function AssistenteIAView({ clientes, pedidos, vendedores, interacoes, loggedUser }: AssistenteIAViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      text: `Olá ${loggedUser.nome}! Sou a Assistente IA do CRM Grupo MF Paris, desenvolvida EXCLUSIVAMENTE para o Grupo MF Paris por Rogério Reis. 🤖\n\nTenho acesso completo aos dados do CRM:\n- **${clientes.length} clientes** cadastrados\n- **${pedidos.length} pedidos** no sistema\n- **${vendedores.length} vendedores** na equipe\n\nComo posso ajudar você hoje?`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const systemPrompt = buildCRMContext({ clientes, pedidos, vendedores, interacoes, loggedUser })

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    setError(null)

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history: AIMessage[] = messages
        .filter(m => m.id !== '0')
        .map(m => ({ role: m.role, content: m.text }))
      history.push({ role: 'user', content: text.trim() })

      const response = await callAI(history, systemPrompt)

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, aiMsg])
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
      text: `Conversa reiniciada, ${loggedUser.nome}! Tenho acesso a **${clientes.length} clientes**, **${pedidos.length} pedidos** e **${vendedores.length} vendedores**. Como posso ajudar você?`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }])
    setError(null)
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
          <div className="flex gap-3 items-end">
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
              disabled={!input.trim() || loading}
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
