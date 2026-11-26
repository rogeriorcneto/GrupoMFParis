import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PencilSquareIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import type { Cliente, Vendedor } from '../../types'
import {
  connectUserEmailAccount,
  deleteUserEmailOutbox,
  disconnectUserEmailAccount,
  fetchUserEmailDetail,
  fetchUserFolderEmails,
  getUserEmailStatus,
  inferUserEmailServers,
  saveUserEmailOutbox,
  sendUserPersonalEmailApi,
  suggestSalesMessage,
  type UserEmailStatusInfo,
  type UserMailItem,
} from '../../lib/botApi'

interface EmailViewProps {
  loggedUser: Vendedor | null
  clientes?: Cliente[]
  cliente?: Cliente | null
  compact?: boolean
  showToast?: (tipo: 'success' | 'error', texto: string) => void
  onUnreadChange?: (count: number) => void
}

type EmailFolder = 'inbox' | 'outbox' | 'sent'

function fmtEmailDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function EmailView({
  loggedUser,
  clientes = [],
  cliente = null,
  compact = false,
  showToast,
  onUnreadChange,
}: EmailViewProps) {
  const defaultClientEmail = useMemo(
    () => (cliente?.contatoEmail || cliente?.emailBoleto || '').trim(),
    [cliente?.id, cliente?.contatoEmail, cliente?.emailBoleto]
  )

  const [status, setStatus] = useState<UserEmailStatusInfo>({ connected: false, unreadCount: 0, outboxCount: 0 })
  const [statusLoading, setStatusLoading] = useState(true)
  const [showAccountSetup, setShowAccountSetup] = useState(false)

  // Form de conexão de credenciais
  const [cfgEmail, setCfgEmail] = useState('')
  const [cfgName, setCfgName] = useState(loggedUser?.nome || '')
  const [cfgPass, setCfgPass] = useState('')
  const [cfgAdvanced, setCfgAdvanced] = useState(false)
  const [cfgSmtpHost, setCfgSmtpHost] = useState('')
  const [cfgSmtpPort, setCfgSmtpPort] = useState('465')
  const [cfgImapHost, setCfgImapHost] = useState('')
  const [cfgImapPort, setCfgImapPort] = useState('993')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Pastas e lista
  const [folder, setFolder] = useState<EmailFolder>('inbox')
  const [filterByClient, setFilterByClient] = useState<boolean>(!!defaultClientEmail)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<UserMailItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  // Leitura x Composição
  const [selectedItem, setSelectedItem] = useState<UserMailItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [composing, setComposing] = useState<boolean>(false)

  // Campos do compositor
  const [outboxDraftId, setOutboxDraftId] = useState<string | undefined>(undefined)
  const [toField, setToField] = useState(defaultClientEmail)
  const [ccField, setCcField] = useState('')
  const [subjectField, setSubjectField] = useState('')
  const [bodyField, setBodyField] = useState('')
  const [inReplyTo, setInReplyTo] = useState<string | undefined>(undefined)
  const [attachments, setAttachments] = useState<{ filename: string; contentBase64: string; contentType?: string }[]>([])
  const [sending, setSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Assistente de IA para e-mail (sem referência a provedor externo)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const meusClientesComEmail = useMemo(() => {
    const isGer = loggedUser?.cargo === 'gerente'
    return clientes
      .filter(c => !c.arquivadoDuplicata && (isGer || c.vendedorId === loggedUser?.id))
      .map(c => ({
        id: c.id,
        razao: c.razaoSocial,
        email: (c.contatoEmail || c.emailBoleto || '').trim(),
      }))
      .filter(x => x.email.includes('@'))
      .slice(0, 300)
  }, [clientes, loggedUser?.id, loggedUser?.cargo])

  const carregarStatus = useCallback(async (force = false) => {
    setStatusLoading(true)
    const st = await getUserEmailStatus(force)
    setStatus(st)
    if (st.email && !cfgEmail) setCfgEmail(st.email)
    if (st.smtpHost && !cfgSmtpHost) setCfgSmtpHost(st.smtpHost)
    if (st.imapHost && !cfgImapHost) setCfgImapHost(st.imapHost)
    if (typeof st.unreadCount === 'number') onUnreadChange?.(st.unreadCount)
    setStatusLoading(false)
    return st
  }, [cfgEmail, cfgSmtpHost, cfgImapHost, onUnreadChange])

  const carregarPasta = useCallback(async (targetFolder: EmailFolder, searchTerm = search, useCliFilter = filterByClient) => {
    setListLoading(true)
    setListError(null)
    const res = await fetchUserFolderEmails({
      folder: targetFolder,
      search: searchTerm.trim() || undefined,
      clienteEmail: useCliFilter && defaultClientEmail ? defaultClientEmail : undefined,
      limit: 50,
    })
    if (res.success) {
      setItems(res.items || [])
      if (typeof res.unreadCount === 'number') {
        setStatus(prev => ({ ...prev, unreadCount: res.unreadCount! }))
        onUnreadChange?.(res.unreadCount)
      }
    } else {
      setItems([])
      setListError(res.error || null)
    }
    setListLoading(false)
  }, [search, filterByClient, defaultClientEmail, onUnreadChange])

  useEffect(() => {
    carregarStatus(false).then(st => {
      if (st.connected) {
        carregarPasta('inbox', '', !!defaultClientEmail)
        if (cliente && !defaultClientEmail) {
          setComposing(true)
        }
      }
    })
  }, [loggedUser?.id, cliente?.id])

  const handleAutoInfer = async (emailVal: string) => {
    if (!emailVal.includes('@')) return
    const inf = await inferUserEmailServers(emailVal)
    if (inf.smtpHost) setCfgSmtpHost(inf.smtpHost)
    if (inf.smtpPort) setCfgSmtpPort(String(inf.smtpPort))
    if (inf.imapHost) setCfgImapHost(inf.imapHost)
    if (inf.imapPort) setCfgImapPort(String(inf.imapPort))
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setConnecting(true)
    setConnectError(null)
    const res = await connectUserEmailAccount({
      email: cfgEmail.trim(),
      displayName: cfgName.trim() || loggedUser?.nome || '',
      password: cfgPass,
      smtpHost: cfgSmtpHost.trim() || undefined,
      smtpPort: Number(cfgSmtpPort) || undefined,
      imapHost: cfgImapHost.trim() || undefined,
      imapPort: Number(cfgImapPort) || undefined,
    })
    setConnecting(false)
    if (!res.success) {
      setConnectError(res.error || 'Falha ao conectar conta de e-mail.')
      return
    }
    setCfgPass('')
    setShowAccountSetup(false)
    showToast?.('success', 'Conta de e-mail conectada com sucesso!')
    await carregarStatus(true)
    await carregarPasta('inbox')
  }

  const handleDisconnect = async () => {
    await disconnectUserEmailAccount()
    setStatus({ connected: false, unreadCount: 0, outboxCount: 0 })
    setItems([])
    setSelectedItem(null)
    onUnreadChange?.(0)
    showToast?.('success', 'Conta de e-mail desconectada.')
  }

  const abrirMensagem = async (item: UserMailItem) => {
    setComposing(false)
    setSelectedItem(item)
    const precisaDetalhe = item.folder === 'outbox'
      || !(item.bodyText || item.bodyHtml)
      || !!(item.hasAttachments && item.attachments?.some(att => !att.contentBase64))
    if (!precisaDetalhe) return
    setDetailLoading(true)
    const det = await fetchUserEmailDetail({ id: item.id, uid: item.uid, folder: item.folder })
    setDetailLoading(false)
    if (!det.success || !det.item) return
    const fullItem = det.item
    if (item.folder === 'outbox') {
      // Se clicou num item da Caixa de Saída, permite editar/reenviar no compositor com anexos completos
      setOutboxDraftId(fullItem.id)
      setToField(fullItem.to)
      setCcField(fullItem.cc || '')
      setSubjectField(fullItem.subject === '(Sem assunto)' ? '' : fullItem.subject)
      setBodyField(fullItem.bodyText || '')
      setAttachments(fullItem.attachments || [])
      setComposing(true)
      return
    }
    setSelectedItem(fullItem)
    if (item.unread) {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, unread: false } : x))
      setStatus(prev => {
        const nextUnread = Math.max(0, (prev.unreadCount || 0) - 1)
        onUnreadChange?.(nextUnread)
        return { ...prev, unreadCount: nextUnread }
      })
    }
  }

  const iniciarNovoEmail = () => {
    setSelectedItem(null)
    setOutboxDraftId(undefined)
    setToField(defaultClientEmail || '')
    setCcField('')
    setSubjectField(cliente ? `Grupo MF Paris — ${cliente.razaoSocial}` : '')
    setBodyField('')
    setInReplyTo(undefined)
    setAttachments([])
    setComposing(true)
  }

  const iniciarResposta = (msg: UserMailItem) => {
    setOutboxDraftId(undefined)
    setToField(msg.fromEmail || msg.from)
    setCcField(msg.cc || '')
    setSubjectField(msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`)
    const citacao = `\n\n---\nEm ${new Date(msg.date).toLocaleString('pt-BR')}, ${msg.from} escreveu:\n> ${(msg.bodyText || msg.snippet || '').split('\n').join('\n> ')}`
    setBodyField(citacao)
    setInReplyTo(msg.messageId)
    setAttachments([])
    setComposing(true)
  }

  const iniciarEncaminhar = (msg: UserMailItem) => {
    setOutboxDraftId(undefined)
    setToField('')
    setCcField('')
    setSubjectField(msg.subject.toLowerCase().startsWith('enc:') || msg.subject.toLowerCase().startsWith('fwd:') ? msg.subject : `Enc: ${msg.subject}`)
    setBodyField(`\n\n---------- Mensagem encaminhada ----------\nDe: ${msg.from}\nData: ${new Date(msg.date).toLocaleString('pt-BR')}\nAssunto: ${msg.subject}\n\n${msg.bodyText || msg.snippet || ''}`)
    setInReplyTo(undefined)
    setAttachments([])
    setComposing(true)
  }

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const novos: { filename: string; contentBase64: string; contentType?: string }[] = []
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        showToast?.('error', `Arquivo ${file.name} excede 10 MB.`)
        continue
      }
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      novos.push({ filename: file.name, contentBase64: b64, contentType: file.type || undefined })
    }
    setAttachments(prev => [...prev, ...novos])
  }

  const baixarAnexoRecebido = (att: { filename: string; contentBase64: string; contentType?: string }) => {
    if (!att.contentBase64) {
      showToast?.('error', 'Anexo indisponível para download neste provedor IMAP.')
      return
    }
    try {
      const bytes = Uint8Array.from(atob(att.contentBase64), ch => ch.charCodeAt(0))
      const blob = new Blob([bytes], { type: att.contentType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.filename || 'anexo'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      showToast?.('error', 'Não foi possível baixar este anexo.')
    }
  }

  const handleSalvarCaixaSaida = async () => {
    setSavingDraft(true)
    const res = await saveUserEmailOutbox({
      id: outboxDraftId,
      to: toField.trim(),
      cc: ccField.trim() || undefined,
      subject: subjectField.trim(),
      body: bodyField,
      attachments,
    })
    setSavingDraft(false)
    if (res.success && res.item) {
      setOutboxDraftId(res.item.id)
      await carregarStatus(false)
      if (folder === 'outbox') await carregarPasta('outbox')
      showToast?.('success', 'Salvo na Caixa de Saída.')
    } else {
      showToast?.('error', res.error || 'Erro ao salvar rascunho.')
    }
  }

  const handleEnviarEmail = async () => {
    if (!toField.trim() || !subjectField.trim()) {
      showToast?.('error', 'Preencha o destinatário (Para) e o Assunto.')
      return
    }
    setSending(true)
    const res = await sendUserPersonalEmailApi({
      outboxId: outboxDraftId,
      to: toField.trim(),
      cc: ccField.trim() || undefined,
      subject: subjectField.trim(),
      body: bodyField,
      inReplyTo,
      clienteId: cliente?.id,
      attachments,
    })
    setSending(false)
    await carregarStatus(false)
    if (res.success) {
      showToast?.('success', 'E-mail enviado com sucesso!')
      setComposing(false)
      setOutboxDraftId(undefined)
      setAttachments([])
      setFolder('sent')
      await carregarPasta('sent')
    } else {
      showToast?.('error', `Falha no envio (mantido na Caixa de Saída): ${res.error || 'erro SMTP'}`)
      setFolder('outbox')
      await carregarPasta('outbox')
    }
  }

  const handleGerarComIA = async (instrucaoCustom?: string) => {
    const instrucao = (instrucaoCustom || aiPrompt).trim() || 'Escreva um e-mail comercial claro, cordial e objetivo com próximo passo definido.'
    setAiLoading(true)
    const contextoResposta = selectedItem ? `\nE-mail recebido anteriormente (${selectedItem.subject}):\n${(selectedItem.bodyText || selectedItem.snippet || '').slice(0, 800)}` : ''
    const res = await suggestSalesMessage({
      canal: 'email',
      text: bodyField,
      instruction: `${instrucao}${contextoResposta}`,
      clienteNome: cliente?.contatoNome || cliente?.razaoSocial || toField,
      empresaNome: cliente?.razaoSocial,
      vendedorNome: loggedUser?.nome,
    })
    setAiLoading(false)
    if (res.success && res.suggestion) {
      setBodyField(res.suggestion.trim())
      if (!subjectField.trim()) {
        setSubjectField(cliente ? `Proposta Comercial — Grupo MF Paris · ${cliente.razaoSocial}` : 'Contato Comercial — Grupo MF Paris')
      }
      setAiPrompt('')
      showToast?.('success', 'Texto gerado pela IA aplicado no e-mail.')
    } else {
      showToast?.('error', res.error || 'Não foi possível gerar sugestão com IA.')
    }
  }

  if (statusLoading) {
    return (
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/[0.06] dark:border-white/[0.08] p-10 text-center text-xs text-gray-500">
        <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-primary-700 rounded-full animate-spin mb-2" />
        <p>Carregando caixa de e-mail...</p>
      </div>
    )
  }

  // Tela de conexão de credenciais (quando não conectado ou quando clicou em Configurar conta)
  if (!status.connected || showAccountSetup) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple border border-black/[0.07] dark:border-white/[0.10] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#F5F5F7] dark:bg-[#262629] flex items-center justify-center">
              <EnvelopeIcon className="h-5 w-5 text-primary-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">Conectar sua Caixa de E-mail</h2>
              <p className="text-xs text-gray-500">Envie e receba e-mails direto no CRM com Caixa de Entrada, Saída, Enviados e IA.</p>
            </div>
          </div>
          {status.connected && (
            <button type="button" onClick={() => setShowAccountSetup(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer">
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {connectError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {connectError}
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Seu e-mail *</label>
              <input
                type="email"
                required
                value={cfgEmail}
                onChange={e => setCfgEmail(e.target.value)}
                onBlur={e => handleAutoInfer(e.target.value)}
                placeholder="voce@mfparis.com.br"
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#F5F5F7] dark:bg-[#262629] border border-black/[0.08] dark:border-white/[0.10] focus:outline-none focus:ring-2 focus:ring-primary-500/25"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nome exibido no envio</label>
              <input
                type="text"
                value={cfgName}
                onChange={e => setCfgName(e.target.value)}
                placeholder={loggedUser?.nome || 'Seu nome'}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#F5F5F7] dark:bg-[#262629] border border-black/[0.08] dark:border-white/[0.10] focus:outline-none focus:ring-2 focus:ring-primary-500/25"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Senha do e-mail (ou senha de aplicativo) *</label>
            <input
              type="password"
              required
              value={cfgPass}
              onChange={e => setCfgPass(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 text-xs rounded-xl bg-[#F5F5F7] dark:bg-[#262629] border border-black/[0.08] dark:border-white/[0.10] focus:outline-none focus:ring-2 focus:ring-primary-500/25"
            />
            <p className="text-[11px] text-gray-400 mt-1">Sua senha é criptografada com AES antes de ser salva e fica isolada apenas no seu perfil.</p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => { if (!cfgSmtpHost && cfgEmail) handleAutoInfer(cfgEmail); setCfgAdvanced(v => !v) }}
              className="text-xs font-medium text-primary-700 hover:underline cursor-pointer"
            >
              {cfgAdvanced ? 'Ocultar servidores IMAP / SMTP' : 'Configurar servidores IMAP / SMTP manualmente (opcional)'}
            </button>
          </div>

          {cfgAdvanced && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[#F5F5F7] dark:bg-[#262629]">
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1">Servidor SMTP (envio)</label>
                <input value={cfgSmtpHost} onChange={e => setCfgSmtpHost(e.target.value)} placeholder="mail.seudominio.com.br" className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#1C1C1E] border border-black/[0.08]" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1">Porta SMTP</label>
                <input value={cfgSmtpPort} onChange={e => setCfgSmtpPort(e.target.value)} placeholder="465 ou 587" className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#1C1C1E] border border-black/[0.08]" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1">Servidor IMAP (entrada)</label>
                <input value={cfgImapHost} onChange={e => setCfgImapHost(e.target.value)} placeholder="mail.seudominio.com.br" className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#1C1C1E] border border-black/[0.08]" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1">Porta IMAP</label>
                <input value={cfgImapPort} onChange={e => setCfgImapPort(e.target.value)} placeholder="993" className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#1C1C1E] border border-black/[0.08]" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {status.connected ? (
              <button type="button" onClick={handleDisconnect} className="text-xs font-semibold text-red-600 hover:underline cursor-pointer">
                Desconectar conta atual ({status.email})
              </button>
            ) : <span />}
            <button
              type="submit"
              disabled={connecting}
              className="px-5 py-2 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold shadow-apple-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {connecting ? 'Verificando IMAP/SMTP...' : 'Conectar e-mail'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-apple border border-black/[0.07] dark:border-white/[0.10] overflow-hidden flex flex-col md:flex-row ${compact ? 'h-[72vh]' : 'h-[calc(100vh-7.5rem)] min-h-[560px]'}`}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => { handleAttachFiles(e.target.files); e.target.value = '' }}
      />
      <datalist id="crm-client-emails-datalist">
        {meusClientesComEmail.map(c => (
          <option key={c.id} value={c.email}>{c.razao}</option>
        ))}
      </datalist>

      {/* COLUNA 1 — Pastas (estilo Apple Mail) */}
      <div className="w-full md:w-52 bg-[#F5F5F7] dark:bg-[#18181B] border-b md:border-b-0 md:border-r border-black/[0.06] dark:border-white/[0.08] p-3 flex flex-col justify-between gap-3 flex-shrink-0">
        <div className="space-y-2">
          <button
            type="button"
            onClick={iniciarNovoEmail}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold shadow-apple-sm transition-colors cursor-pointer"
          >
            <PencilSquareIcon className="h-4 w-4" />
            Novo e-mail
          </button>

          <div className="space-y-0.5 pt-1">
            {([
              { id: 'inbox', label: 'Caixa de Entrada', icon: InboxIcon, badge: status.unreadCount, badgeCls: 'bg-red-500 text-white' },
              { id: 'outbox', label: 'Caixa de Saída', icon: ClockIcon, badge: status.outboxCount, badgeCls: 'bg-amber-500 text-white' },
              { id: 'sent', label: 'Enviados', icon: PaperAirplaneIcon, badge: 0, badgeCls: '' },
            ] as const).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setComposing(false); setSelectedItem(null); setFolder(f.id); carregarPasta(f.id) }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  folder === f.id && !composing
                    ? 'bg-white dark:bg-[#2C2C30] text-gray-900 dark:text-white font-semibold shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <f.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{f.label}</span>
                </span>
                {f.badge > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${f.badgeCls}`}>
                    {f.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
          <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate" title={status.email}>
            {status.email}
          </p>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <button
              type="button"
              onClick={() => { carregarStatus(true); carregarPasta(folder) }}
              className="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => setShowAccountSetup(true)}
              className="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
              title="Configurar ou trocar conta de e-mail"
            >
              <Cog6ToothIcon className="h-3.5 w-3.5" /> Conta
            </button>
          </div>
        </div>
      </div>

      {/* COLUNA 2 — Lista de mensagens da pasta */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-black/[0.06] dark:border-white/[0.08] flex flex-col flex-shrink-0 max-h-[38vh] md:max-h-none">
        <div className="p-2.5 border-b border-black/[0.05] dark:border-white/[0.07] space-y-2">
          <form
            onSubmit={e => { e.preventDefault(); carregarPasta(folder, search, filterByClient) }}
            className="relative"
          >
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar e-mails..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[#F5F5F7] dark:bg-[#262629] focus:outline-none focus:ring-2 focus:ring-primary-500/25"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(''); carregarPasta(folder, '', filterByClient) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer">
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {defaultClientEmail && (
            <div className="flex items-center justify-between gap-1 text-[11px] bg-[#F5F5F7] dark:bg-[#262629] px-2.5 py-1 rounded-lg">
              <span className="truncate text-gray-600 dark:text-gray-300">
                {filterByClient ? `Cliente: ${defaultClientEmail}` : 'Exibindo todos os e-mails'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = !filterByClient
                  setFilterByClient(next)
                  carregarPasta(folder, search, next)
                }}
                className="text-primary-700 font-semibold hover:underline whitespace-nowrap cursor-pointer"
              >
                {filterByClient ? 'Ver todos' : 'Só cliente'}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {listLoading ? (
            <div className="py-12 text-center text-xs text-gray-400">
              <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-primary-700 rounded-full animate-spin mb-1.5" />
              <p>Sincronizando pasta...</p>
            </div>
          ) : listError ? (
            <div className="p-4 text-xs text-red-600">{listError}</div>
          ) : items.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-gray-400">
              Nenhum e-mail nesta pasta.
            </div>
          ) : (
            items.map(item => {
              const active = !composing && selectedItem?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => abrirMensagem(item)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer ${
                    active ? 'bg-[#E8ECF4] dark:bg-white/[0.10]' : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.unread && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                      {item.status === 'failed' && <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      <p className={`text-xs truncate ${item.unread ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-200'}`}>
                        {folder === 'inbox' ? item.from : `Para: ${item.to || '(sem destinatário)'}`}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">{fmtEmailDate(item.date)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${item.unread ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                    {item.subject}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {item.error ? `Falha: ${item.error}` : item.snippet}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* COLUNA 3 — Leitor ou Compositor com Assistente de IA */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1C1C1E] overflow-hidden">
        {composing ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {outboxDraftId ? 'Caixa de Saída / Rascunho' : 'Nova mensagem'}
              </h3>
              <div className="flex items-center gap-1.5">
                {outboxDraftId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteUserEmailOutbox(outboxDraftId)
                      setComposing(false)
                      setOutboxDraftId(undefined)
                      await carregarStatus(false)
                      if (folder === 'outbox') await carregarPasta('outbox')
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    title="Descartar da Caixa de Saída"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 cursor-pointer"
                  title="Fechar editor"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.07] space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-14 text-gray-400 font-medium">Para:</span>
                <input
                  type="text"
                  list="crm-client-emails-datalist"
                  value={toField}
                  onChange={e => setToField(e.target.value)}
                  placeholder="cliente@empresa.com.br"
                  className="flex-1 py-1 bg-transparent focus:outline-none text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2 border-t border-black/[0.04] pt-1.5">
                <span className="w-14 text-gray-400 font-medium">Cc:</span>
                <input
                  type="text"
                  value={ccField}
                  onChange={e => setCcField(e.target.value)}
                  placeholder="Opcional..."
                  className="flex-1 py-1 bg-transparent focus:outline-none text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2 border-t border-black/[0.04] pt-1.5">
                <span className="w-14 text-gray-400 font-medium">Assunto:</span>
                <input
                  type="text"
                  value={subjectField}
                  onChange={e => setSubjectField(e.target.value)}
                  placeholder="Assunto do e-mail..."
                  className="flex-1 py-1 bg-transparent focus:outline-none font-medium text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Barra de Ajuda de IA para redigir/melhorar e-mail */}
            <div className="px-4 py-2 bg-[#F5F5F7] dark:bg-[#242428] border-b border-black/[0.05] dark:border-white/[0.07] space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 mr-1">
                  <SparklesIcon className="h-3.5 w-3.5 text-primary-700" /> Ajuda de IA:
                </span>
                {[
                  { label: 'Apresentação / Proposta', prompt: 'Escreva um e-mail comercial executivo apresentando o Grupo MF Paris (insumos lácteos Okey Lac e Horizonte) e propondo cotação.' },
                  { label: 'Follow-up de proposta', prompt: 'Escreva um follow-up cordial e objetivo perguntando se o cliente conseguiu avaliar nossa proposta comercial.' },
                  { label: 'Melhorar meu texto', prompt: 'Reescreva e melhore o rascunho atual com português impecável, tom executivo B2B e chamada clara para o próximo passo.' },
                  ...(selectedItem ? [{ label: 'Responder com IA', prompt: 'Redija uma resposta comercial completa, prestativa e objetiva ao e-mail recebido do cliente.' }] : []),
                ].map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={aiLoading}
                    onClick={() => handleGerarComIA(chip.prompt)}
                    className="px-2.5 py-1 rounded-full bg-white dark:bg-[#1C1C1E] hover:bg-primary-50 border border-black/[0.07] text-[11px] font-medium text-gray-700 dark:text-gray-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleGerarComIA() } }}
                  placeholder="Ou peça à IA como quer o e-mail (ex.: cobrar retorno de amostra enviada há 10 dias)..."
                  className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-[#1C1C1E] border border-black/[0.07] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => handleGerarComIA()}
                  className="px-3 py-1 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[11px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {aiLoading ? 'Gerando...' : 'Gerar com IA'}
                </button>
              </div>
            </div>

            <textarea
              value={bodyField}
              onChange={e => setBodyField(e.target.value)}
              placeholder="Escreva sua mensagem..."
              className="flex-1 w-full p-4 text-xs sm:text-sm leading-relaxed bg-transparent focus:outline-none resize-none text-gray-900 dark:text-gray-100"
            />

            {attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-black/[0.05] flex items-center gap-1.5 flex-wrap">
                {attachments.map((att, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F5F5F7] dark:bg-[#262629] text-[11px] text-gray-700">
                    <PaperClipIcon className="h-3 w-3" />
                    <span className="max-w-[160px] truncate">{att.filename}</span>
                    <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-600 cursor-pointer">
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFEFF4] dark:bg-[#262629] hover:bg-black/[0.08] text-xs font-medium text-gray-700 dark:text-gray-200 cursor-pointer"
                >
                  <PaperClipIcon className="h-4 w-4" /> Anexar
                </button>
                <button
                  type="button"
                  disabled={savingDraft}
                  onClick={handleSalvarCaixaSaida}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFEFF4] dark:bg-[#262629] hover:bg-black/[0.08] text-xs font-medium text-gray-700 dark:text-gray-200 cursor-pointer"
                >
                  {savingDraft ? 'Salvando...' : 'Salvar na Caixa de Saída'}
                </button>
              </div>
              <button
                type="button"
                disabled={sending}
                onClick={handleEnviarEmail}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold shadow-apple-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                {sending ? 'Enviando...' : 'Enviar e-mail'}
              </button>
            </div>
          </div>
        ) : selectedItem ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">
                  {selectedItem.subject}
                </h3>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => iniciarResposta(selectedItem)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EFEFF4] dark:bg-[#2C2C30] hover:bg-black/[0.08] text-xs font-semibold text-gray-800 dark:text-gray-100 cursor-pointer"
                  >
                    <ArrowUturnLeftIcon className="h-3.5 w-3.5" /> Responder
                  </button>
                  <button
                    type="button"
                    onClick={() => iniciarEncaminhar(selectedItem)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EFEFF4] dark:bg-[#2C2C30] hover:bg-black/[0.08] text-xs font-semibold text-gray-800 dark:text-gray-100 cursor-pointer"
                  >
                    <ArrowUturnRightIcon className="h-3.5 w-3.5" /> Encaminhar
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p><strong className="text-gray-700 dark:text-gray-300">De:</strong> {selectedItem.from}</p>
                <p><strong className="text-gray-700 dark:text-gray-300">Para:</strong> {selectedItem.to}</p>
                {selectedItem.cc && <p><strong className="text-gray-700 dark:text-gray-300">Cc:</strong> {selectedItem.cc}</p>}
                <p className="text-[11px] text-gray-400 tabular-nums">{new Date(selectedItem.date).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {!!selectedItem.attachments?.length && (
                <div className="mb-4 pb-3 border-b border-black/[0.05] dark:border-white/[0.07] flex items-center gap-2 flex-wrap">
                  {selectedItem.attachments.map((att, idx) => (
                    <button
                      key={`${att.filename}-${idx}`}
                      type="button"
                      onClick={() => baixarAnexoRecebido(att)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#262629] hover:bg-black/[0.08] text-[11px] font-medium text-gray-700 dark:text-gray-200 cursor-pointer"
                      title={att.contentBase64 ? 'Baixar anexo' : 'Anexo detectado, mas conteúdo indisponível no provedor'}
                    >
                      <PaperClipIcon className="h-3.5 w-3.5" />
                      <span className="max-w-[190px] truncate">{att.filename}</span>
                      {!!att.size && <span className="text-gray-400">({Math.max(1, Math.round(att.size / 1024))} KB)</span>}
                    </button>
                  ))}
                </div>
              )}
              {detailLoading ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-primary-700 rounded-full animate-spin mb-2" />
                  <p>Carregando mensagem...</p>
                </div>
              ) : selectedItem.bodyHtml ? (
                <iframe
                  title={selectedItem.subject}
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;margin:0;padding:4px;word-break:break-word;}img{max-width:100%;height:auto;}</style></head><body>${selectedItem.bodyHtml}</body></html>`}
                  className="w-full h-full min-h-[340px] border-0 bg-white rounded-xl"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {selectedItem.bodyText || selectedItem.snippet || '(Mensagem sem conteúdo de texto)'}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] dark:bg-[#262629] flex items-center justify-center mb-3">
              <EnvelopeIcon className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sua Caixa de E-mail</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Selecione uma mensagem ao lado para ler e responder, ou clique em Novo e-mail.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
