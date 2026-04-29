import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/database'
import type { Vendedor, ChatMensagem } from '../types'
import {
  XMarkIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline'

interface ChatInternoProps {
  loggedUser: Vendedor
  vendedores: Vendedor[]
  onClose: () => void
  onUnreadChange: (count: number) => void
}

const SUPORTE_CONTATO: Vendedor = {
  id: -1,
  nome: 'Suporte GMF Paris',
  email: 'suporte@gmfparis.com.br',
  telefone: '',
  usuario: 'suporte',
  cargo: 'gerente',
  avatar: '🆘',
  ativo: true,
  metaVendas: 0,
  metaLeads: 0,
  metaConversao: 0,
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatInterno({ loggedUser, vendedores, onClose, onUnreadChange }: ChatInternoProps) {  // eslint-disable-line
  const [selectedUser, setSelectedUser] = useState<Vendedor | null>(null)
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({})
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const contatos: Vendedor[] = [
    SUPORTE_CONTATO,
    ...vendedores.filter(v => v.id !== loggedUser.id && v.ativo),
  ]

  const loadUnread = useCallback(async () => {
    try {
      const counts = await db.fetchUnreadCounts(loggedUser.id)
      setUnreadCounts(counts)
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      onUnreadChange(total)
    } catch { /* non-critical */ }
  }, [loggedUser.id, onUnreadChange])

  useEffect(() => {
    loadUnread()
  }, [loadUnread])

  useEffect(() => {
    if (!selectedUser || selectedUser.id === -1) return

    db.fetchChatMensagens(loggedUser.id, selectedUser.id)
      .then(msgs => {
        setMensagens(msgs)
        db.markChatMensagensRead(loggedUser.id, selectedUser.id).then(loadUnread)
      })
      .catch(() => {})

    const channel = supabase
      .channel(`chat_${Math.min(loggedUser.id, selectedUser.id)}_${Math.max(loggedUser.id, selectedUser.id)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensagens' },
        (payload) => {
          const row = payload.new as any
          const isRelevant =
            (row.sender_id === loggedUser.id && row.receiver_id === selectedUser.id) ||
            (row.sender_id === selectedUser.id && row.receiver_id === loggedUser.id)
          if (!isRelevant) {
            loadUnread()
            return
          }
          const msg: ChatMensagem = {
            id: row.id,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            content: row.content,
            readAt: row.read_at ?? null,
            createdAt: row.created_at,
          }
          setMensagens(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          if (row.sender_id === selectedUser.id) {
            db.markChatMensagensRead(loggedUser.id, selectedUser.id).then(loadUnread)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedUser, loggedUser.id, loadUnread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  useEffect(() => {
    if (selectedUser) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [selectedUser])

  const handleSelectUser = (user: Vendedor) => {
    setSelectedUser(user)
    setMobileShowChat(true)
    setMensagens([])
  }

  const handleSend = async () => {
    if (!inputText.trim() || !selectedUser || selectedUser.id === -1 || sending) return
    const text = inputText.trim()
    setInputText('')
    setSending(true)
    try {
      await db.insertChatMensagem(loggedUser.id, selectedUser.id, text)
    } catch {
      setInputText(text)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-gray-200 bg-white"
      style={{ width: 'min(680px, calc(100vw - 24px))', height: 'min(560px, calc(100vh - 120px))' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-700 to-primary-600 text-white flex-shrink-0">
        <div className="flex items-center gap-2">
          {mobileShowChat && selectedUser && (
            <button onClick={() => { setMobileShowChat(false); setSelectedUser(null) }}
              className="sm:hidden p-1 rounded-lg hover:bg-white/20 transition-colors mr-1">
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
          <ChatBubbleLeftRightIcon className="h-5 w-5" />
          <span className="font-semibold text-sm">
            {mobileShowChat && selectedUser ? selectedUser.nome : 'Chat Interno'}
          </span>
          {totalUnread > 0 && !mobileShowChat && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalUnread}
            </span>
          )}
        </div>
        <button onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Contacts list */}
        <div className={`${mobileShowChat ? 'hidden' : 'flex'} sm:flex flex-col border-r border-gray-200 bg-gray-50 flex-shrink-0`}
          style={{ width: '200px' }}>
          <div className="px-3 py-2 border-b border-gray-200">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Contatos</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contatos.map(user => {
              const unread = unreadCounts[user.id] || 0
              const isSelected = selectedUser?.id === user.id
              const isSuport = user.id === -1
              return (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-100 ${isSelected ? 'bg-primary-50 border-r-2 border-primary-500' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${isSuport ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-700'}`}>
                    {isSuport ? '🆘' : (user.avatar || user.nome.charAt(0).toUpperCase())}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-800'}`}>
                      {isSuport ? 'Suporte' : user.nome.split(' ')[0]}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {isSuport ? 'Atendimento' : (user.cargo === 'gerente' ? 'Gerente' : user.cargo === 'sdr' ? 'SDR' : 'Vendedor')}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                      {unread}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {/* User info bottom */}
          <div className="px-3 py-2 border-t border-gray-200 bg-white flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center text-[11px] font-bold text-primary-700">
              {loggedUser.avatar || loggedUser.nome.charAt(0)}
            </div>
            <p className="text-[11px] text-gray-600 font-medium truncate">{loggedUser.nome.split(' ')[0]}</p>
          </div>
        </div>

        {/* Chat area */}
        <div className={`${!mobileShowChat ? 'hidden' : 'flex'} sm:flex flex-1 flex-col min-w-0`}>
          {!selectedUser ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">Selecione um contato para iniciar a conversa</p>
            </div>
          ) : selectedUser.id === -1 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <span className="text-4xl">🆘</span>
              <p className="text-sm font-semibold text-gray-700">Suporte GMF Paris</p>
              <p className="text-xs text-gray-500">Para entrar em contato com o suporte técnico, envie um email para:<br />
                <a href="mailto:suporte@gmfparis.com.br" className="text-primary-600 hover:underline font-medium">
                  suporte@gmfparis.com.br
                </a>
              </p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                {mensagens.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-gray-400 text-center">Nenhuma mensagem ainda.<br />Diga olá! 👋</p>
                  </div>
                )}
                {mensagens.map(msg => {
                  const isMine = msg.senderId === loggedUser.id
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        isMine
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                      }`}>
                        <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? 'text-primary-200 text-right' : 'text-gray-400'}`}>
                          {formatTime(msg.createdAt)}
                          {isMine && msg.readAt && ' ✓✓'}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 bg-white flex-shrink-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem para ${selectedUser.nome.split(' ')[0]}...`}
                  className="flex-1 text-sm bg-gray-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-400 transition-all"
                  disabled={sending}
                  maxLength={2000}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sending}
                  className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
