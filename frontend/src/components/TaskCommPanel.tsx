import React, { useState, useRef, useEffect, useCallback } from 'react'
import { XMarkIcon, PaperAirplaneIcon, PhoneIcon, ClockIcon } from '@heroicons/react/24/outline'
import type { Cliente, Vendedor, Interacao } from '../types'
import { sendWhatsApp, sendEmailViaBot, fetchWhatsAppMessages } from '../lib/botApi'
import { fetchInteracoesByCliente, insertInteracao, insertAtividade } from '../lib/database'
import { formatBrazilianPhone } from '../utils/validators'

interface Message {
  id: number
  text: string
  from: 'me' | 'them' | 'system'
  time: string
}

interface HistoricoItem {
  id: number | string
  tipo: string
  descricao: string
  data: string
  origem: 'interacao' | 'atividade' | 'whatsapp' | 'email'
}

interface TaskCommPanelProps {
  cliente: Cliente
  loggedUser: Vendedor | null
  onClose: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

type TabType = 'whatsapp' | 'email' | 'telefone' | 'historico'

const TaskCommPanel: React.FC<TaskCommPanelProps> = ({ cliente, loggedUser, onClose, showToast }) => {
  const [activeTab, setActiveTab] = useState<TabType>('whatsapp')

  // WhatsApp state
  const [waMessages, setWaMessages] = useState<Message[]>([])
  const [waText, setWaText] = useState('')
  const [waSending, setWaSending] = useState(false)
  const [waLoading, setWaLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Email state
  const [emailTo, setEmailTo] = useState(cliente.contatoEmail || '')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)

  // Histórico state
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const whatsappNumber = cliente.whatsapp || cliente.contatoCelular || cliente.contatoTelefone || ''
  const phoneNumber = cliente.contatoTelefone || cliente.contatoCelular || ''
  const cleanPhone = phoneNumber.replace(/\D/g, '')

  // Registrar ligação no banco ao clicar em "Ligar"
  const registerCall = async (numero: string) => {
    try {
      await insertInteracao({
        clienteId: cliente.id,
        tipo: 'ligacao',
        data: new Date().toISOString(),
        assunto: `Ligação para ${cliente.contatoNome || cliente.razaoSocial}`,
        descricao: `Ligação realizada para ${numero} — ${cliente.razaoSocial}`,
        automatico: false,
      })
      await insertAtividade({
        tipo: 'ligacao',
        descricao: `Ligação para ${cliente.razaoSocial} (${numero})`,
        vendedorNome: loggedUser?.nome || 'Vendedor',
        timestamp: new Date().toISOString(),
      })
      showToast?.('success', `Ligação registrada para ${cliente.razaoSocial}`)
    } catch (err) {
      // Ligação já foi iniciada via tel:, apenas falhou o registro
      console.error('Erro ao registrar ligação:', err)
    }
  }

  // Load WhatsApp history from DB
  const loadWaHistory = useCallback(async () => {
    if (!cliente.id) return
    setWaLoading(true)
    try {
      const msgs = await fetchWhatsAppMessages({ clienteId: cliente.id, limit: 200 })
      setWaMessages(msgs.map((m: any) => ({
        id: m.id || Date.now(),
        text: m.mensagem,
        from: m.direcao === 'recebida' ? 'them' as const : 'me' as const,
        time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
      })))
    } catch {
      // silently fail
    }
    setWaLoading(false)
  }, [cliente.id])

  // Load Histórico (interações + atividades)
  const loadHistorico = useCallback(async () => {
    if (!cliente.id) return
    setHistLoading(true)
    try {
      const [interacoes, waMsgs] = await Promise.all([
        fetchInteracoesByCliente(cliente.id),
        fetchWhatsAppMessages({ clienteId: cliente.id, limit: 200 }),
      ])
      const items: HistoricoItem[] = []
      // Interações (email, ligação, reunião, etc)
      for (const i of interacoes) {
        items.push({
          id: i.id,
          tipo: i.tipo,
          descricao: i.descricao || i.assunto || '',
          data: i.data,
          origem: i.tipo === 'email' ? 'email' : 'interacao',
        })
      }
      // WhatsApp messages
      for (const m of waMsgs) {
        items.push({
          id: `wa-${m.id}`,
          tipo: m.direcao === 'recebida' ? 'whatsapp_recebida' : 'whatsapp_enviada',
          descricao: m.mensagem,
          data: m.createdAt || '',
          origem: 'whatsapp',
        })
      }
      // Sort by date descending
      items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      setHistorico(items)
    } catch {
      // silently fail
    }
    setHistLoading(false)
  }, [cliente.id])

  useEffect(() => {
    if (activeTab === 'whatsapp') loadWaHistory()
    if (activeTab === 'historico') loadHistorico()
  }, [activeTab, loadWaHistory, loadHistorico])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [waMessages])

  const handleSendWhatsApp = async () => {
    if (!waText.trim() || !whatsappNumber) return
    const msg = waText.trim()
    setWaText('')
    setWaSending(true)

    setWaMessages(prev => [...prev, {
      id: Date.now(),
      text: msg,
      from: 'me',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }])

    const result = await sendWhatsApp(
      whatsappNumber.replace(/\D/g, ''),
      msg,
      cliente.id,
      loggedUser?.nome,
      loggedUser?.id
    )

    if (!result.success) {
      setWaMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: '❌ Falha ao enviar: ' + (result.error || 'Erro desconhecido'),
        from: 'system',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }])
      showToast?.('error', 'Falha ao enviar WhatsApp: ' + (result.error || ''))
    } else {
      showToast?.('success', 'Mensagem WhatsApp enviada!')
    }

    setWaSending(false)
  }

  const handleSendEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      showToast?.('error', 'Preencha todos os campos do email.')
      return
    }
    setEmailSending(true)

    const result = await sendEmailViaBot(
      emailTo.trim(),
      emailSubject.trim(),
      emailBody.trim(),
      cliente.id,
      loggedUser?.nome
    )

    if (result.success) {
      showToast?.('success', 'Email enviado com sucesso!')
      setEmailSubject('')
      setEmailBody('')
    } else {
      showToast?.('error', 'Falha ao enviar email: ' + (result.error || ''))
    }

    setEmailSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendWhatsApp()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-end z-50">
      <div className="bg-white h-full w-full max-w-lg flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{cliente.contatoNome || cliente.razaoSocial}</h2>
            <p className="text-xs text-gray-500 truncate">{cliente.razaoSocial}</p>
          </div>
          <button onClick={onClose} className="ml-3 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'whatsapp' ? 'text-green-700 border-b-2 border-green-500 bg-green-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            💬 WhatsApp
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'email' ? 'text-blue-700 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            📧 Email
          </button>
          <button
            onClick={() => setActiveTab('telefone')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'telefone' ? 'text-purple-700 border-b-2 border-purple-500 bg-purple-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            📞 Telefone
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'historico' ? 'text-orange-700 border-b-2 border-orange-500 bg-orange-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            📋 Histórico
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ─── WhatsApp Tab ─── */}
          {activeTab === 'whatsapp' && (
            <>
              {!whatsappNumber ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="text-center">
                    <p className="text-4xl mb-3">📵</p>
                    <p className="text-gray-600 font-medium">Sem número de WhatsApp</p>
                    <p className="text-sm text-gray-400 mt-1">Este cliente não possui número de celular/WhatsApp cadastrado.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Contact info */}
                  <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{(cliente.contatoNome || cliente.razaoSocial).charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{whatsappNumber}</p>
                        <p className="text-xs text-green-600">Via número comercial (Baileys)</p>
                      </div>
                    </div>
                    <a
                      href={`https://wa.me/${formatBrazilianPhone(whatsappNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-700 hover:text-green-800 underline"
                    >
                      Abrir no WhatsApp Web ↗
                    </a>
                  </div>

                  {/* Chat area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]">
                    {waLoading && (
                      <div className="text-center py-4">
                        <div className="inline-block animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                      </div>
                    )}
                    {!waLoading && waMessages.length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-sm text-gray-600 bg-white bg-opacity-80 inline-block px-4 py-2 rounded-lg shadow-sm">
                          Envie uma mensagem para {cliente.contatoNome || cliente.razaoSocial}
                        </p>
                      </div>
                    )}
                    {waMessages.map(msg => (
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

                  {/* Input area */}
                  <div className="p-3 bg-gray-100 border-t border-gray-200">
                    <div className="flex gap-2">
                      <textarea
                        value={waText}
                        onChange={e => setWaText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite uma mensagem..."
                        rows={1}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none"
                      />
                      <button
                        onClick={handleSendWhatsApp}
                        disabled={waSending || !waText.trim()}
                        className="w-10 h-10 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                      >
                        {waSending ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <PaperAirplaneIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── Email Tab ─── */}
          {activeTab === 'email' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {!cliente.contatoEmail ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-4xl mb-3">📭</p>
                    <p className="text-gray-600 font-medium">Sem email cadastrado</p>
                    <p className="text-sm text-gray-400 mt-1">Este cliente não possui email cadastrado.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-apple p-3">
                    <p className="text-xs text-blue-700">
                      Email enviado via SMTP do CRM. O cliente receberá do endereço configurado nas integrações.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Para</label>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assunto *</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      placeholder="Ex: Proposta comercial - Grupo MF Paris"
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem *</label>
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      rows={8}
                      placeholder={`Olá ${cliente.contatoNome || ''},\n\nSegue nossa proposta...\n\nAtenciosamente,\n${loggedUser?.nome || ''}\nGrupo MF Paris`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSendEmail}
                      disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-apple transition-colors"
                    >
                      {emailSending ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <PaperAirplaneIcon className="h-4 w-4" />
                      )}
                      {emailSending ? 'Enviando...' : 'Enviar Email'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Histórico Tab ─── */}
          {activeTab === 'historico' && (
            <div className="flex-1 overflow-y-auto">
              {histLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-6 w-6 border-2 border-orange-600 border-t-transparent rounded-full" />
                </div>
              ) : historico.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <ClockIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Nenhum histórico encontrado</p>
                    <p className="text-sm text-gray-400 mt-1">As interações com este cliente aparecerão aqui.</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {historico.map(item => {
                    const tipoIcon = item.tipo === 'whatsapp_enviada' ? '💬↗' :
                      item.tipo === 'whatsapp_recebida' ? '💬↙' :
                      item.tipo === 'whatsapp' ? '💬' :
                      item.tipo === 'email' ? '📧' :
                      item.tipo === 'ligacao' ? '📞' :
                      item.tipo === 'reuniao' ? '🤝' :
                      item.tipo === 'nota' ? '📝' : '📋'
                    const tipoLabel = item.tipo === 'whatsapp_enviada' ? 'WhatsApp enviada' :
                      item.tipo === 'whatsapp_recebida' ? 'WhatsApp recebida' :
                      item.tipo === 'whatsapp' ? 'WhatsApp' :
                      item.tipo === 'email' ? 'Email' :
                      item.tipo === 'ligacao' ? 'Ligação' :
                      item.tipo === 'reuniao' ? 'Reunião' :
                      item.tipo === 'nota' ? 'Nota' : item.tipo
                    const bgColor = item.origem === 'whatsapp' ? 'bg-green-50' :
                      item.origem === 'email' ? 'bg-blue-50' : 'bg-gray-50'
                    return (
                      <div key={item.id} className={`px-4 py-3 hover:bg-gray-50 ${item.tipo === 'whatsapp_recebida' ? 'border-l-4 border-l-green-300' : item.tipo === 'whatsapp_enviada' ? 'border-l-4 border-l-green-500' : item.tipo === 'email' ? 'border-l-4 border-l-blue-400' : 'border-l-4 border-l-gray-300'}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-lg flex-shrink-0 mt-0.5">{tipoIcon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bgColor}`}>{tipoLabel}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {item.data ? new Date(item.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1 line-clamp-3">{item.descricao}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Telefone Tab ─── */}
          {activeTab === 'telefone' && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center space-y-6 max-w-sm">
                <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto">
                  <PhoneIcon className="h-10 w-10 text-purple-600" />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900">{cliente.contatoNome || cliente.razaoSocial}</h3>
                  <p className="text-sm text-gray-500">{cliente.razaoSocial}</p>
                </div>

                <div className="space-y-3">
                  {cliente.contatoTelefone && (
                    <a
                      href={`tel:${cliente.contatoTelefone.replace(/\D/g, '')}`}
                      onClick={() => registerCall(cliente.contatoTelefone)}
                      className="flex items-center justify-center gap-3 w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-apple font-medium transition-colors shadow-apple-sm"
                    >
                      <PhoneIcon className="h-5 w-5" />
                      {cliente.contatoTelefone}
                    </a>
                  )}
                  {cliente.contatoCelular && cliente.contatoCelular !== cliente.contatoTelefone && (
                    <a
                      href={`tel:${cliente.contatoCelular.replace(/\D/g, '')}`}
                      onClick={() => registerCall(cliente.contatoCelular!)}
                      className="flex items-center justify-center gap-3 w-full py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-apple font-medium transition-colors shadow-apple-sm"
                    >
                      <PhoneIcon className="h-5 w-5" />
                      📱 {cliente.contatoCelular}
                    </a>
                  )}
                  {cliente.contatoTelefoneFixo && (
                    <a
                      href={`tel:${cliente.contatoTelefoneFixo.replace(/\D/g, '')}`}
                      onClick={() => registerCall(cliente.contatoTelefoneFixo!)}
                      className="flex items-center justify-center gap-3 w-full py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-apple font-medium transition-colors shadow-apple-sm"
                    >
                      <PhoneIcon className="h-5 w-5" />
                      ☎️ {cliente.contatoTelefoneFixo}
                    </a>
                  )}
                  {!phoneNumber && (
                    <div className="text-center">
                      <p className="text-4xl mb-3">📵</p>
                      <p className="text-gray-600 font-medium">Sem telefone cadastrado</p>
                    </div>
                  )}
                </div>

                {cleanPhone && (
                  <div className="pt-2 border-t border-gray-200">
                    <a
                      href={`https://wa.me/${formatBrazilianPhone(phoneNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-apple text-sm font-medium transition-colors"
                    >
                      💬 Abrir no WhatsApp Web
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TaskCommPanel
