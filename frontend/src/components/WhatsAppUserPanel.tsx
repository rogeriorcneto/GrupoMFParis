import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { XMarkIcon, PaperAirplaneIcon, ArrowPathIcon, QrCodeIcon, PhoneIcon, MicrophoneIcon, StopIcon, TrashIcon, PhotoIcon, MagnifyingGlassIcon, UserGroupIcon, ChatBubbleLeftRightIcon, SparklesIcon, CpuChipIcon, CheckCircleIcon, DevicePhoneMobileIcon, ArrowDownTrayIcon, ShareIcon, ChevronUpIcon, ChevronDownIcon, FolderOpenIcon, PaperClipIcon, DocumentTextIcon, LinkIcon } from '@heroicons/react/24/outline'
import type { Cliente, Vendedor } from '../types'
import {
  getUserWhatsAppStatus, getUserWhatsAppQR,
  connectUserWhatsApp, disconnectUserWhatsApp,
  sendUserWhatsApp, fetchWhatsAppMessages, fetchWhatsAppChatMessages,
  queryWhatsAppAI, getUserWhatsAppContacts,
  sendUserWhatsAppAudio, sendUserWhatsAppImage, sendUserWhatsAppDocument,
  validateWhatsAppContacts, suggestSalesMessage,
  getUserWavoipToken, saveUserWavoipToken, syncWavoipWebphone, iniciarLigacaoWhatsAppWavoip,
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

/** Lightbox Apple para visualizar imagem ampliada, fazer download e compartilhar APENAS com os contatos do próprio usuário */
export const WhatsAppImageLightbox: React.FC<{
  mediaUrl: string
  caption?: string
  onClose: () => void
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}> = ({ mediaUrl, caption, onClose, showToast }) => {
  const [shareOpen, setShareOpen] = useState(false)
  const [contacts, setContacts] = useState<WAContactItem[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedNums, setSelectedNums] = useState<string[]>([])
  const [shareCaption, setShareCaption] = useState('')
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const abrirCompartilhar = async () => {
    setShareOpen(true)
    if (contacts.length === 0) {
      setLoadingContacts(true)
      try {
        const list = await getUserWhatsAppContacts()
        setContacts(list || [])
      } catch {
        setContacts([])
      } finally {
        setLoadingContacts(false)
      }
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(mediaUrl)
      const blob = await res.blob()
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `whatsapp-imagem-${Date.now()}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
    } catch {
      const a = document.createElement('a')
      a.href = mediaUrl
      a.target = '_blank'
      a.download = `whatsapp-imagem-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      setDownloading(false)
    }
  }

  const toggleContact = (num: string) => {
    setSelectedNums(prev => prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num])
  }

  const handleConfirmShare = async () => {
    if (selectedNums.length === 0 || sharing) return
    setSharing(true)
    try {
      let base64 = ''
      let mime = 'image/jpeg'
      if (mediaUrl.startsWith('data:')) {
        const [meta, b64] = mediaUrl.split(',')
        base64 = b64 || ''
        const m = meta?.match(/^data:([^;]+)/)
        if (m?.[1]) mime = m[1]
      } else {
        const res = await fetch(mediaUrl)
        const blob = await res.blob()
        mime = blob.type || 'image/jpeg'
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }
      let ok = 0
      for (const num of selectedNums) {
        const r = await sendUserWhatsAppImage(num, base64, mime, shareCaption.trim() || undefined)
        if (r.success) ok++
      }
      if (ok > 0) {
        showToast?.('success', `Imagem compartilhada com ${ok} contato(s)!`)
        setShareOpen(false)
        setSelectedNums([])
        setShareCaption('')
      } else {
        showToast?.('error', 'Não foi possível enviar a imagem para os contatos selecionados.')
      }
    } catch (err: any) {
      showToast?.('error', 'Erro ao compartilhar imagem: ' + (err?.message || ''))
    } finally {
      setSharing(false)
    }
  }

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.number.includes(q) || (c.notify || '').toLowerCase().includes(q)
  })

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center max-w-4xl w-full max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Barra superior de ações */}
        <div className="w-full flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-2xl bg-white/95 dark:bg-[#1C1C1E]/95 border border-black/[0.08] shadow-lg">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
            {caption && !caption.startsWith('📷') ? caption : 'Visualização da imagem'}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFEFF4] dark:bg-[#2C2C30] hover:bg-black/[0.08] text-gray-800 dark:text-gray-100 text-xs font-semibold transition-colors cursor-pointer"
              title="Baixar imagem"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {downloading ? 'Baixando...' : 'Download'}
            </button>
            <button
              type="button"
              onClick={abrirCompartilhar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Compartilhar apenas com os seus contatos"
            >
              <ShareIcon className="h-4 w-4" />
              Compartilhar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Imagem ampliada */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <img
            src={mediaUrl}
            alt={caption || 'Imagem WhatsApp'}
            className="max-w-full max-h-[76vh] object-contain rounded-2xl shadow-2xl bg-black/20"
          />
        </div>

        {/* Painel de compartilhamento (restrito aos contatos do próprio usuário) */}
        {shareOpen && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl p-4">
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl border border-black/[0.08] dark:border-white/[0.10] w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Compartilhar imagem</h4>
                  <p className="text-[11px] text-gray-500">Exibindo apenas os seus contatos</p>
                </div>
                <button type="button" onClick={() => setShareOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3 border-b border-gray-100 space-y-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar nos seus contatos..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F5F5F7] dark:bg-[#262629] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/25"
                  />
                </div>
                <input
                  type="text"
                  value={shareCaption}
                  onChange={e => setShareCaption(e.target.value)}
                  placeholder="Legenda opcional..."
                  className="w-full px-3 py-1.5 text-xs bg-[#F5F5F7] dark:bg-[#262629] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/25"
                />
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-[180px] max-h-[280px]">
                {loadingContacts ? (
                  <p className="text-xs text-gray-400 py-8 text-center">Carregando seus contatos...</p>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-gray-400 py-8 text-center">Nenhum contato encontrado na sua carteira/WhatsApp.</p>
                ) : (
                  filtered.map(ct => {
                    const checked = selectedNums.includes(ct.number)
                    return (
                      <button
                        key={ct.jid}
                        type="button"
                        onClick={() => toggleContact(ct.number)}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-gray-50 cursor-pointer ${checked ? 'bg-primary-50/70' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{ct.name}</p>
                          <p className="text-[11px] text-gray-400 tabular-nums">+{ct.number}</p>
                        </div>
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-primary-700 border-primary-700 text-white' : 'border-gray-300'}`}>
                          {checked ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{selectedNums.length} selecionado(s)</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShareOpen(false)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={selectedNums.length === 0 || sharing}
                    onClick={handleConfirmShare}
                    className="px-4 py-1.5 text-xs font-semibold bg-primary-700 hover:bg-primary-800 disabled:bg-gray-300 text-white rounded-xl cursor-pointer"
                  >
                    {sharing ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export interface WhatsAppMediaEntry {
  id: string | number
  tipo: 'image' | 'video' | 'audio' | 'document' | 'link'
  mediaUrl?: string
  url?: string
  text: string
  fileName?: string
  timeLabel: string
  fromMe: boolean
}

/** Galeria estilo WhatsApp real (Mídia, Áudios, Arquivos e Links) reutilizada no chat e no histórico do card */
export const WhatsAppMediaGallery: React.FC<{
  items: WhatsAppMediaEntry[]
  onOpenImage: (url: string, caption?: string) => void
  onClose?: () => void
}> = ({ items, onOpenImage, onClose }) => {
  const [subTab, setSubTab] = useState<'midia' | 'audios' | 'docs' | 'links'>('midia')

  const midias = useMemo(() => items.filter(i => (i.tipo === 'image' || i.tipo === 'video') && !!i.mediaUrl), [items])
  const audios = useMemo(() => items.filter(i => i.tipo === 'audio' && !!i.mediaUrl), [items])
  const docs = useMemo(() => items.filter(i => i.tipo === 'document'), [items])
  const links = useMemo(() => items.filter(i => i.tipo === 'link' && !!i.url), [items])

  return (
    <div className="flex flex-col h-full bg-[#F5F5F7] dark:bg-[#141416]">
      <div className="px-4 py-2.5 bg-white dark:bg-[#1C1C1E] border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex p-0.5 rounded-xl bg-[#EFEFF4] dark:bg-[#2C2C30]">
          {([
            { id: 'midia', label: `Mídia (${midias.length})` },
            { id: 'audios', label: `Áudios (${audios.length})` },
            { id: 'docs', label: `Arquivos (${docs.length})` },
            { id: 'links', label: `Links (${links.length})` },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                subTab === t.id
                  ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-black/[0.08] cursor-pointer"
          >
            <XMarkIcon className="h-3.5 w-3.5" /> Voltar à conversa
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {subTab === 'midia' && (
          midias.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12">Nenhuma foto ou vídeo nesta conversa.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {midias.map(m => (
                <div key={String(m.id)} className="relative aspect-square rounded-xl overflow-hidden bg-white dark:bg-[#262629] border border-black/[0.06] group">
                  {m.tipo === 'video' ? (
                    <video controls src={m.mediaUrl} className="w-full h-full object-cover" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenImage(m.mediaUrl!, m.text)}
                      className="w-full h-full block cursor-pointer focus:outline-none"
                      title="Clique para ampliar, baixar ou compartilhar"
                    >
                      <img src={m.mediaUrl} alt={m.text} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] tabular-nums">
                        {m.timeLabel}
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {subTab === 'audios' && (
          audios.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12">Nenhum áudio enviado ou recebido nesta conversa.</p>
          ) : (
            <div className="space-y-2">
              {audios.map(a => (
                <div key={String(a.id)} className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                    <audio controls src={a.mediaUrl} className="h-9 flex-1 max-w-xs" />
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      <span className={`font-semibold ${a.fromMe ? 'text-primary-700' : 'text-gray-700'}`}>
                        {a.fromMe ? 'Enviado' : 'Recebido'}
                      </span>
                      {' · '}
                      {a.timeLabel}
                    </div>
                  </div>
                  <a
                    href={a.mediaUrl}
                    download={`audio-${a.id}.ogg`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-xs font-medium text-gray-700 hover:bg-black/[0.08]"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Baixar
                  </a>
                </div>
              ))}
            </div>
          )
        )}

        {subTab === 'docs' && (
          docs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12">Nenhum arquivo ou documento nesta conversa.</p>
          ) : (
            <div className="space-y-2">
              {docs.map(d => {
                const nomeDoc = d.fileName || d.text.replace(/^📎\s*/, '') || 'Documento'
                return (
                  <div key={String(d.id)} className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#EFEFF4] dark:bg-[#2C2C30] flex items-center justify-center flex-shrink-0">
                        <DocumentTextIcon className="h-5 w-5 text-primary-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{nomeDoc}</p>
                        <p className="text-[11px] text-gray-400 tabular-nums">
                          {d.fromMe ? 'Enviado' : 'Recebido'} · {d.timeLabel}
                        </p>
                      </div>
                    </div>
                    {d.mediaUrl ? (
                      <a
                        href={d.mediaUrl}
                        download={nomeDoc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-700 text-white text-xs font-semibold hover:bg-primary-800 flex-shrink-0"
                      >
                        <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Abrir / Baixar
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-400 flex-shrink-0">Registrado</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {subTab === 'links' && (
          links.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12">Nenhum link compartilhado nesta conversa.</p>
          ) : (
            <div className="space-y-2">
              {links.map(l => (
                <a
                  key={String(l.id)}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white dark:bg-[#1C1C1E] hover:bg-gray-50 rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-primary-700 flex-shrink-0" />
                    <p className="text-xs font-semibold text-primary-700 truncate">{l.url}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mt-1">{l.text}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{l.fromMe ? 'Enviado' : 'Recebido'} · {l.timeLabel}</p>
                </a>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

export function extrairItensGaleriaWhatsApp(
  rawList: { id: string | number; text: string; mediaUrl?: string; tipo?: string; fileName?: string; timeLabel: string; fromMe: boolean }[]
): WhatsAppMediaEntry[] {
  const out: WhatsAppMediaEntry[] = []
  const urlRegex = /https?:\/\/[^\s<>")]+/gi
  for (const m of rawList) {
    if (m.tipo === 'image' && m.mediaUrl) {
      out.push({ id: m.id, tipo: 'image', mediaUrl: m.mediaUrl, text: m.text, timeLabel: m.timeLabel, fromMe: m.fromMe })
    } else if (m.tipo === 'video' && m.mediaUrl) {
      out.push({ id: m.id, tipo: 'video', mediaUrl: m.mediaUrl, text: m.text, timeLabel: m.timeLabel, fromMe: m.fromMe })
    } else if (m.tipo === 'audio' && m.mediaUrl) {
      out.push({ id: m.id, tipo: 'audio', mediaUrl: m.mediaUrl, text: m.text, timeLabel: m.timeLabel, fromMe: m.fromMe })
    } else if (m.tipo === 'document' || m.text?.startsWith('📎')) {
      out.push({ id: m.id, tipo: 'document', mediaUrl: m.mediaUrl, fileName: m.fileName, text: m.text, timeLabel: m.timeLabel, fromMe: m.fromMe })
    }
    const foundUrls = (m.text || '').match(urlRegex)
    if (foundUrls) {
      foundUrls.forEach((u, idx) => {
        out.push({ id: `${m.id}-link-${idx}`, tipo: 'link', url: u, text: m.text, timeLabel: m.timeLabel, fromMe: m.fromMe })
      })
    }
  }
  return out.reverse()
}

function highlightQueryText(text: string, query: string, isMine: boolean): React.ReactNode {
  const q = query.trim()
  if (!q) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  if (parts.length <= 1) return text
  const lower = q.toLowerCase()
  return parts.map((part, idx) =>
    part.toLowerCase() === lower ? (
      <mark
        key={idx}
        className={`rounded px-0.5 font-semibold ${isMine ? 'bg-amber-300 text-gray-900' : 'bg-amber-200 text-gray-900'}`}
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  )
}

/** Renderiza o corpo da mensagem — mídia (áudio, imagem clicável, vídeo, doc) ou texto */
function renderMessageContent(
  msg: Message,
  isMine = false,
  onOpenImage?: (url: string, caption?: string) => void,
  searchQuery = '',
) {
  if (msg.mediaUrl) {
    switch (msg.tipo) {
      case 'audio':
        return <audio controls src={msg.mediaUrl} className="w-full max-w-[240px] h-9" />
      case 'image':
        return (
          <button
            type="button"
            onClick={() => onOpenImage ? onOpenImage(msg.mediaUrl!, msg.text) : window.open(msg.mediaUrl, '_blank')}
            className="block text-left group cursor-pointer focus:outline-none"
            title="Clique para ampliar, baixar ou compartilhar"
          >
            <img src={msg.mediaUrl} alt={msg.text} className="rounded-xl max-w-[240px] max-h-[240px] object-cover mb-1 group-hover:opacity-95 transition-opacity" />
          </button>
        )
      case 'video':
        return <video controls src={msg.mediaUrl} className="rounded-xl max-w-[240px] max-h-[240px] mb-1" />
      case 'document':
        return (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className={`underline text-xs block mb-1 ${isMine ? 'text-white/90' : 'text-primary-700'}`}>
            {highlightQueryText(msg.fileName || 'Abrir documento', searchQuery, isMine)}
          </a>
        )
      default:
        break
    }
  }
  return <p className="whitespace-pre-wrap">{highlightQueryText(msg.text || '', searchQuery, isMine)}</p>
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

  // Call & voice recorder + Wavoip WhatsApp Voice state
  const [showCallRecorder, setShowCallRecorder] = useState(false)
  const [callMode, setCallMode] = useState<CallMode>('phone')
  const [wavoipToken, setWavoipToken] = useState('')
  const [wavoipDraft, setWavoipDraft] = useState('')
  const [showWavoipConfig, setShowWavoipConfig] = useState(false)
  const [savingWavoip, setSavingWavoip] = useState(false)
  const [callingWavoip, setCallingWavoip] = useState(false)
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

  // Image/Document attachment + Lightbox + Media Gallery + Smart scroll + In-chat search state
  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null)
  const [showMediaGallery, setShowMediaGallery] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const forceScrollBottomRef = useRef(true)
  const prevMsgCountRef = useRef(0)
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false)

  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [chatSearchIdx, setChatSearchIdx] = useState(0)
  const chatSearchInputRef = useRef<HTMLInputElement>(null)
  const msgElemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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
    forceScrollBottomRef.current = true
    isNearBottomRef.current = true
    prevMsgCountRef.current = 0
    setHasUnreadBelow(false)
    setChatSearchOpen(false)
    setChatSearchQuery('')
    setChatSearchIdx(0)
    setShowMediaGallery(false)

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
            const systemMsgs = prev.filter(m => m.from === 'system')
            const pendingLocal = prev.filter(m => {
              if (typeof m.id !== 'number') return false
              const jaChegou = incoming.some(inc =>
                inc.from === m.from &&
                (inc.text === m.text || (m.text.includes('Áudio') && inc.tipo === 'audio') || (m.text.includes('[Imagem]') && inc.tipo === 'image'))
              )
              return !jaChegou
            })
            const next = [...incoming, ...pendingLocal, ...systemMsgs]
            // Se nada mudou, preserva a referência de prev para NÃO disparar re-render nem mexer na rolagem!
            if (
              prev.length === next.length &&
              prev.every((m, idx) => String(m.id) === String(next[idx].id) && m.mediaUrl === next[idx].mediaUrl && m.text === next[idx].text)
            ) {
              return prev
            }
            return next
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
              const next = [...incoming, ...systemMsgs]
              if (
                prev.length === next.length &&
                prev.every((m, idx) => String(m.id) === String(next[idx].id) && m.mediaUrl === next[idx].mediaUrl && m.text === next[idx].text)
              ) {
                return prev
              }
              return next
            })
          }).catch(() => {})
        }
      }).catch(() => {})
    }, 5_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [waStatus.connected, cliente?.id, cliente?.whatsapp, cliente?.contatoCelular, cliente?.contatoTelefone, selectedContact?.jid])

  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainerRef.current
    if (!el) return
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
    isNearBottomRef.current = true
    setHasUnreadBelow(false)
  }, [])

  // Rolagem inteligente: só desce ao abrir a conversa, ao enviar mensagem ou quando o usuário já está no final.
  // Se o usuário subiu para ler o histórico (ou está buscando), NUNCA puxa a tela para baixo sozinho!
  useEffect(() => {
    if (messages.length === 0) {
      prevMsgCountRef.current = 0
      return
    }
    if (chatSearchOpen && chatSearchQuery.trim()) {
      prevMsgCountRef.current = messages.length
      return
    }
    if (forceScrollBottomRef.current) {
      forceScrollBottomRef.current = false
      requestAnimationFrame(() => scrollToBottom(false))
    } else if (isNearBottomRef.current) {
      if (messages.length > prevMsgCountRef.current) {
        requestAnimationFrame(() => scrollToBottom(true))
      }
    } else if (messages.length > prevMsgCountRef.current) {
      setHasUnreadBelow(true)
    }
    prevMsgCountRef.current = messages.length
  }, [messages, chatSearchOpen, chatSearchQuery, scrollToBottom])

  const matchedMsgIds = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase()
    if (!chatSearchOpen || !q) return [] as string[]
    return messages
      .filter(m => m.from !== 'system' && (`${m.text || ''} ${m.fileName || ''}`).toLowerCase().includes(q))
      .map(m => String(m.id))
  }, [messages, chatSearchOpen, chatSearchQuery])

  const activeMatchedMsgId = matchedMsgIds.length > 0
    ? matchedMsgIds[Math.min(chatSearchIdx, matchedMsgIds.length - 1)]
    : null

  useEffect(() => {
    if (!activeMatchedMsgId) return
    const el = msgElemRefs.current.get(activeMatchedMsgId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeMatchedMsgId])

  // Handle image send
  const handleImageSend = useCallback(async (file: File) => {
    const num = getChatNumber()
    if (!num) { showToast?.('error', 'Sem número para enviar.'); return }
    setSending(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = dataUrl.split(',')[1]
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const tempId = Date.now()
      forceScrollBottomRef.current = true
      setMessages(prev => [...prev, { id: tempId, text: `📷 [Imagem] ${file.name}`, mediaUrl: dataUrl, tipo: 'image', from: 'me', time: now }])
      const result = await sendUserWhatsAppImage(num, base64, file.type, undefined, cliente?.id)
      if (!result.success) {
        setMessages(prev => prev.filter(m => m.id !== tempId))
        showToast?.('error', 'Falha ao enviar imagem: ' + (result.error || ''))
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          id: (result as any).messageId || m.id,
          mediaUrl: (result as any).mediaUrl || m.mediaUrl,
        } : m))
        showToast?.('success', 'Imagem enviada!')
      }
    } catch (err: any) {
      showToast?.('error', 'Erro ao processar imagem: ' + (err?.message || ''))
    }
    setSending(false)
  }, [getChatNumber, cliente?.id, showToast])

  // Handle document/file send
  const handleDocumentSend = useCallback(async (file: File) => {
    const num = getChatNumber()
    if (!num) { showToast?.('error', 'Sem número para enviar.'); return }
    setSending(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = dataUrl.split(',')[1]
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const tempId = Date.now()
      forceScrollBottomRef.current = true
      setMessages(prev => [...prev, { id: tempId, text: `📎 ${file.name}`, fileName: file.name, tipo: 'document', from: 'me', time: now }])
      const result = await sendUserWhatsAppDocument(num, base64, file.name, file.type || 'application/octet-stream', undefined, cliente?.id)
      if (!result.success) {
        setMessages(prev => prev.filter(m => m.id !== tempId))
        showToast?.('error', 'Falha ao enviar arquivo: ' + (result.error || ''))
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          id: result.messageId || m.id,
          mediaUrl: result.mediaUrl || m.mediaUrl,
          fileName: result.fileName || file.name,
        } : m))
        showToast?.('success', 'Arquivo enviado!')
      }
    } catch (err: any) {
      showToast?.('error', 'Erro ao enviar arquivo: ' + (err?.message || ''))
    }
    setSending(false)
  }, [getChatNumber, cliente?.id, showToast])

  const galleryItems = useMemo(() => extrairItensGaleriaWhatsApp(
    messages.filter(m => m.from !== 'system').map(m => ({
      id: m.id,
      text: m.text,
      mediaUrl: m.mediaUrl,
      tipo: m.tipo,
      fileName: m.fileName,
      timeLabel: m.time,
      fromMe: m.from === 'me',
    }))
  ), [messages])

  useEffect(() => {
    getUserWavoipToken().then(tok => {
      setWavoipToken(tok)
      setWavoipDraft(tok)
      if (tok) syncWavoipWebphone(tok, document.documentElement.classList.contains('dark')).catch(() => {})
    }).catch(() => {})
  }, [loggedUser?.id])

  const handleSalvarWavoipToken = async () => {
    setSavingWavoip(true)
    const res = await saveUserWavoipToken(wavoipDraft.trim())
    setSavingWavoip(false)
    if (res.success) {
      const novo = wavoipDraft.trim()
      setWavoipToken(novo)
      await syncWavoipWebphone(novo, document.documentElement.classList.contains('dark'))
      setShowWavoipConfig(false)
      showToast?.('success', novo ? 'Voz WhatsApp (Wavoip) ativada!' : 'Token Wavoip removido.')
    } else {
      showToast?.('error', res.error || 'Erro ao salvar token Wavoip.')
    }
  }

  const handleLigarWhatsApp = async () => {
    const num = getChatNumber()
    if (!num) { showToast?.('error', 'Sem número para ligar.'); return }
    if (!wavoipToken) {
      setShowWavoipConfig(true)
      return
    }
    setCallingWavoip(true)
    const res = await iniciarLigacaoWhatsAppWavoip({
      token: wavoipToken,
      numero: num,
      displayName: getChatName(),
      isDark: document.documentElement.classList.contains('dark'),
    })
    setCallingWavoip(false)
    if (!res.success) {
      showToast?.('error', 'Falha na chamada WhatsApp: ' + (res.error || 'verifique se o dispositivo está conectado no Wavoip.'))
    }
  }

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

    const tempId = Date.now()
    forceScrollBottomRef.current = true
    setMessages(prev => [...prev, {
      id: tempId, text: msg, from: 'me',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }])

    const result = await sendUserWhatsApp(chatNum, msg, cliente?.id)
    if (!result.success) {
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),
        {
          id: Date.now() + 1, text: 'Falha ao enviar: ' + (result.error || 'Erro'), from: 'system',
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
      setChatText(msg)
      showToast?.('error', 'Falha ao enviar: ' + (result.error || ''))
    } else {
      if ((result as any).messageId) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: (result as any).messageId } : m))
      }
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
      if (!result.success) {
        setMessages(prev => prev.filter(m => m.text !== `🎙️ Áudio (${durationLabel})` || typeof m.id !== 'number'))
        showToast?.('error', 'Falha ao enviar áudio: ' + (result.error || ''))
      } else {
        if ((result as any).messageId) {
          setMessages(prev => prev.map(m => (typeof m.id === 'number' && m.text === `🎙️ Áudio (${durationLabel})`) ? { ...m, id: (result as any).messageId } : m))
        }
        showToast?.('success', 'Áudio enviado!')
      }
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
      {/* Hidden file input for images and documents */}
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
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.xml,.txt,.zip"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleDocumentSend(file)
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
                  type="button"
                  onClick={() => setShowMediaGallery(v => !v)}
                  title="Mídia, áudios, arquivos e links desta conversa"
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    showMediaGallery
                      ? 'bg-primary-700 text-white'
                      : 'bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08]'
                  }`}
                >
                  <FolderOpenIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Mídia e arquivos</span>
                  {galleryItems.length > 0 && (
                    <span className={`px-1 rounded-full text-[10px] tabular-nums ${showMediaGallery ? 'bg-white/20 text-white' : 'bg-black/[0.07] text-gray-700'}`}>
                      {galleryItems.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatSearchOpen(v => {
                      const next = !v
                      if (!next) { setChatSearchQuery(''); setChatSearchIdx(0) }
                      else setTimeout(() => chatSearchInputRef.current?.focus(), 30)
                      return next
                    })
                  }}
                  title="Buscar na conversa"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    chatSearchOpen
                      ? 'bg-primary-700 text-white'
                      : 'bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08]'
                  }`}
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLigarWhatsApp}
                  disabled={callingWavoip}
                  title={wavoipToken ? 'Ligar pelo WhatsApp (Wavoip)' : 'Configurar ligação pelo WhatsApp (Wavoip)'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    wavoipToken
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-[#EFEFF4] dark:bg-[#2C2C30] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08]'
                  }`}
                >
                  <PhoneIcon className="h-3.5 w-3.5" />
                  <span>{callingWavoip ? 'Chamando...' : 'Ligar WhatsApp'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowWavoipConfig(v => !v)}
                  title="Configurar token de voz Wavoip"
                  className="px-2 py-1.5 rounded-lg bg-[#EFEFF4] dark:bg-[#2C2C30] text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-black/[0.08] cursor-pointer"
                >
                  {wavoipToken ? 'Voz ativa' : 'Token Voz'}
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

          {/* Configuração rápida do Token de Voz WhatsApp (Wavoip) por usuário */}
          {showWavoipConfig && (
            <div className="px-4 py-3 bg-white dark:bg-[#1C1C1E] border-b border-black/[0.06] dark:border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Ligação de Voz pelo WhatsApp (Wavoip)</p>
                  <p className="text-[11px] text-gray-500">Cole abaixo o Token do seu Dispositivo criado em app.wavoip.com → Dispositivos</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowWavoipConfig(false); setCallMode('phone'); setShowCallRecorder(true) }}
                  className="text-[11px] text-primary-700 hover:underline font-medium whitespace-nowrap cursor-pointer"
                >
                  Usar gravador comum
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={wavoipDraft}
                  onChange={e => setWavoipDraft(e.target.value)}
                  placeholder="Cole aqui o Token do Dispositivo Wavoip..."
                  className="flex-1 px-3 py-1.5 text-xs bg-[#F5F5F7] dark:bg-[#262629] border border-black/[0.08] dark:border-white/[0.10] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/25"
                />
                <button
                  type="button"
                  disabled={savingWavoip}
                  onClick={handleSalvarWavoipToken}
                  className="px-3 py-1.5 rounded-lg bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingWavoip ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWavoipConfig(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Barra de busca dentro da conversa */}
          {chatSearchOpen && (
            <div className="px-3 py-2 bg-white/95 dark:bg-[#1C1C1E]/95 border-b border-black/[0.05] dark:border-white/[0.07] flex items-center gap-2">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={chatSearchInputRef}
                  type="text"
                  value={chatSearchQuery}
                  onChange={e => { setChatSearchQuery(e.target.value); setChatSearchIdx(Math.max(0, matchedMsgIds.length - 1)) }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setChatSearchOpen(false); setChatSearchQuery('') }
                    if (e.key === 'Enter' && matchedMsgIds.length > 0) {
                      e.preventDefault()
                      setChatSearchIdx(prev => e.shiftKey ? (prev - 1 + matchedMsgIds.length) % matchedMsgIds.length : (prev + 1) % matchedMsgIds.length)
                    }
                  }}
                  placeholder="Buscar palavra ou trecho nesta conversa..."
                  className="w-full pl-8 pr-3 py-1 text-xs bg-[#F5F5F7] dark:bg-[#262629] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/25"
                />
              </div>
              {chatSearchQuery.trim() && (
                <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                  {matchedMsgIds.length === 0 ? '0 resultados' : `${Math.min(chatSearchIdx + 1, matchedMsgIds.length)} de ${matchedMsgIds.length}`}
                </span>
              )}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={matchedMsgIds.length === 0}
                  onClick={() => setChatSearchIdx(prev => (prev - 1 + matchedMsgIds.length) % matchedMsgIds.length)}
                  title="Resultado anterior"
                  className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30 text-gray-600 cursor-pointer"
                >
                  <ChevronUpIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={matchedMsgIds.length === 0}
                  onClick={() => setChatSearchIdx(prev => (prev + 1) % matchedMsgIds.length)}
                  title="Próximo resultado"
                  className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30 text-gray-600 cursor-pointer"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { setChatSearchOpen(false); setChatSearchQuery('') }}
                  title="Fechar busca"
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {showMediaGallery ? (
            <div className="flex-1 overflow-hidden" style={{ minHeight: compact ? 240 : 340 }}>
              <WhatsAppMediaGallery
                items={galleryItems}
                onOpenImage={(url, caption) => setLightboxImage({ url, caption })}
                onClose={() => setShowMediaGallery(false)}
              />
            </div>
          ) : (
            /* Messages — Apple Messages style (Claro e Escuro) com rolagem livre sem puxar para baixo */
          <div
            ref={messagesContainerRef}
            onScroll={() => {
              const el = messagesContainerRef.current
              if (!el) return
              const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90
              isNearBottomRef.current = nearBottom
              if (nearBottom && hasUnreadBelow) setHasUnreadBelow(false)
            }}
            className="relative flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#F5F5F7] dark:bg-[#141416]"
            style={{ minHeight: compact ? 200 : 300 }}
          >
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
            {messages.map(msg => {
              const strId = String(msg.id)
              const isActiveMatch = activeMatchedMsgId === strId
              return (
                <div
                  key={msg.id}
                  ref={el => {
                    if (el) msgElemRefs.current.set(strId, el)
                    else msgElemRefs.current.delete(strId)
                  }}
                  className={`flex ${msg.from === 'me' ? 'justify-end' : msg.from === 'them' ? 'justify-start' : 'justify-center'}`}
                >
                  {msg.from === 'system' ? (
                    <div className="bg-white dark:bg-[#262629] border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-full max-w-[85%] shadow-sm">
                      {msg.text}
                    </div>
                  ) : msg.from === 'them' ? (
                    <div className={`text-[13px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-bl-sm max-w-[82%] shadow-sm bg-white dark:bg-[#262629] text-gray-900 dark:text-gray-100 border border-black/[0.04] dark:border-white/[0.06] transition-all ${isActiveMatch ? 'ring-2 ring-amber-400' : ''}`}>
                      {renderMessageContent(msg, false, (url, caption) => setLightboxImage({ url, caption }), chatSearchOpen ? chatSearchQuery : '')}
                      <p className="text-[10px] text-right mt-1 text-gray-400 tabular-nums">{msg.time}</p>
                    </div>
                  ) : (
                    <div className={`text-[13px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-br-sm max-w-[82%] shadow-sm bg-primary-700 dark:bg-[#2A4380] text-white transition-all ${isActiveMatch ? 'ring-2 ring-amber-400' : ''}`}>
                      {renderMessageContent(msg, true, (url, caption) => setLightboxImage({ url, caption }), chatSearchOpen ? chatSearchQuery : '')}
                      <p className="text-[10px] text-right mt-1 text-white/70 tabular-nums">{msg.time} · enviada</p>
                    </div>
                  )}
                </div>
              )
            })}
            {hasUnreadBelow && (
              <div className="sticky bottom-2 flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={() => scrollToBottom(true)}
                  className="pointer-events-auto px-3 py-1 rounded-full bg-white/95 dark:bg-[#262629]/95 border border-black/[0.08] shadow-md text-xs font-semibold text-primary-700 hover:bg-white cursor-pointer"
                >
                  ↓ Novas mensagens
                </button>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          )}

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
                <button
                  onClick={() => docInputRef.current?.click()}
                  disabled={sending || !getChatNumber()}
                  title="Enviar arquivo / PDF / documento"
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 bg-[#EFEFF4] dark:bg-[#262629] text-gray-600 hover:text-gray-900 disabled:opacity-40"
                >
                  <PaperClipIcon className="h-4 w-4" />
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
      {/* Lightbox de imagem ampliada + download + compartilhar apenas com contatos do usuário */}
      {lightboxImage && (
        <WhatsAppImageLightbox
          mediaUrl={lightboxImage.url}
          caption={lightboxImage.caption}
          onClose={() => setLightboxImage(null)}
          showToast={showToast}
        />
      )}
    </div>
  )
}

export default WhatsAppUserPanel
