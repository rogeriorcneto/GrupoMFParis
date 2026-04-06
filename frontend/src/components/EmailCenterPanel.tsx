import React from 'react'
import type { Cliente } from '../types'
import type { InboxEmailItem } from '../lib/botApi'
import { fetchEmailInbox, sendEmailViaBot } from '../lib/botApi'

interface EmailCenterPanelProps {
  cliente: Cliente
  vendedorNome?: string
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

export default function EmailCenterPanel({ cliente, vendedorNome, showToast }: EmailCenterPanelProps) {
  const [inboxLoading, setInboxLoading] = React.useState(false)
  const [inboxError, setInboxError] = React.useState('')
  const [inboxItems, setInboxItems] = React.useState<InboxEmailItem[]>([])
  const [selectedEmailId, setSelectedEmailId] = React.useState<string>('')

  const [emailTo, setEmailTo] = React.useState(cliente.contatoEmail || '')
  const [emailSubject, setEmailSubject] = React.useState('')
  const [emailBody, setEmailBody] = React.useState('')
  const [emailSending, setEmailSending] = React.useState(false)

  const selectedEmail = React.useMemo(
    () => inboxItems.find((item) => item.id === selectedEmailId) || inboxItems[0],
    [inboxItems, selectedEmailId]
  )

  const loadInbox = React.useCallback(async () => {
    const targetEmail = (cliente.contatoEmail || '').trim()
    if (!targetEmail) {
      setInboxItems([])
      setInboxError('Cliente sem email cadastrado.')
      return
    }

    setInboxLoading(true)
    setInboxError('')
    const result = await fetchEmailInbox(targetEmail, 30)
    if (!result.success) {
      setInboxItems([])
      setInboxError(result.error || 'Não foi possível carregar os emails recebidos.')
    } else {
      const data = result.data || []
      setInboxItems(data)
      if (data.length > 0) {
        setSelectedEmailId((prev) => (prev && data.some((x) => x.id === prev) ? prev : data[0].id))
      } else {
        setSelectedEmailId('')
      }
    }
    setInboxLoading(false)
  }, [cliente.contatoEmail])

  React.useEffect(() => {
    setEmailTo(cliente.contatoEmail || '')
    setEmailSubject('')
    setEmailBody('')
    loadInbox()
  }, [cliente.id, cliente.contatoEmail, loadInbox])

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
      vendedorNome
    )

    if (result.success) {
      showToast?.('success', 'Email enviado com sucesso!')
      setEmailSubject('')
      setEmailBody('')
      await loadInbox()
    } else {
      showToast?.('error', 'Falha ao enviar email: ' + (result.error || ''))
    }

    setEmailSending(false)
  }

  return (
    <div className="space-y-4">
      {!cliente.contatoEmail ? (
        <div className="text-center py-6">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-sm text-gray-600">Sem email cadastrado para este cliente.</p>
        </div>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-apple p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-blue-700">
              Caixa de entrada vinculada ao cliente <strong>{cliente.contatoEmail}</strong>.
            </p>
            <button
              onClick={loadInbox}
              disabled={inboxLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-apple bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {inboxLoading ? 'Atualizando...' : 'Atualizar inbox'}
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded-apple overflow-hidden bg-white">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700">
                Emails recebidos
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {inboxLoading && (
                  <div className="p-4 text-xs text-gray-500">Carregando emails...</div>
                )}
                {!inboxLoading && inboxError && (
                  <div className="p-4 text-xs text-red-600">{inboxError}</div>
                )}
                {!inboxLoading && !inboxError && inboxItems.length === 0 && (
                  <div className="p-4 text-xs text-gray-500">Nenhum email encontrado para este cliente.</div>
                )}
                {!inboxLoading && !inboxError && inboxItems.map((mail) => (
                  <button
                    key={mail.id}
                    onClick={() => setSelectedEmailId(mail.id)}
                    className={`w-full text-left p-3 hover:bg-gray-50 ${selectedEmail?.id === mail.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-800 truncate">{mail.subject || '(Sem assunto)'}</p>
                      {mail.unread && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Novo</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{mail.from}</p>
                    <p className="text-[11px] text-gray-600 line-clamp-2 mt-1">{mail.snippet || '(Sem conteúdo)'}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(mail.date).toLocaleString('pt-BR')}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-apple bg-white overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700">
                Conteúdo do email
              </div>
              <div className="p-3 max-h-72 overflow-y-auto">
                {!selectedEmail ? (
                  <p className="text-xs text-gray-500">Selecione um email para visualizar o conteúdo.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-900">{selectedEmail.subject || '(Sem assunto)'}</p>
                    <p className="text-xs text-gray-500">De: {selectedEmail.from}</p>
                    <p className="text-xs text-gray-500">Para: {selectedEmail.to}</p>
                    <p className="text-xs text-gray-400">{new Date(selectedEmail.date).toLocaleString('pt-BR')}</p>
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{selectedEmail.bodyText || selectedEmail.snippet || '(Sem corpo de mensagem)'}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-apple bg-white p-3 space-y-3">
            <h4 className="text-sm font-semibold text-gray-900">Novo email</h4>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Para</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Assunto *</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mensagem *</label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={5}
                placeholder={`Olá ${cliente.contatoNome || ''},\n\n\n\nAtenciosamente,\n${vendedorNome || ''}\nGrupo MF Paris`}
                className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <button
              onClick={handleSendEmail}
              disabled={emailSending || !emailSubject.trim() || !emailBody.trim() || !emailTo.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-apple transition-colors"
            >
              {emailSending ? 'Enviando...' : 'Enviar Email'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
