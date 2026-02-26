import React, { useState, useEffect, useRef, useCallback } from 'react'
import { authFetch, BOT_URL } from '../../lib/botApi'

interface WhatsAppStatus {
  connected: boolean
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  number: string | null
  uptime: number
}

interface EmailStatus {
  configured: boolean
  from: string
}

interface QRResponse {
  qr: string | null
  status: string
  number?: string
}

interface EmailFormData {
  emailHost: string
  emailPort: string
  emailUser: string
  emailPass: string
  emailFrom: string
}

const IntegracoesView: React.FC = () => {
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({ connected: false, status: 'disconnected', number: null, uptime: 0 })
  const [emailStatus, setEmailStatus] = useState<EmailStatus>({ configured: false, from: '' })
  const [qrData, setQrData] = useState<string | null>(null)
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [botOnline, setBotOnline] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Email config form
  const [emailForm, setEmailForm] = useState<EmailFormData>({ emailHost: '', emailPort: '587', emailUser: '', emailPass: '', emailFrom: '' })
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const configLoadedRef = useRef(false)

  // Carregar config salva do backend
  const loadConfig = useCallback(async () => {
    try {
      const res = await authFetch(`${BOT_URL}/api/config`)
      const cfg = await res.json()
      setEmailForm({
        emailHost: cfg.emailHost || '',
        emailPort: String(cfg.emailPort || 587),
        emailUser: cfg.emailUser || '',
        emailPass: cfg.emailPass || '',
        emailFrom: cfg.emailFrom || '',
      })
      configLoadedRef.current = true
    } catch { /* bot offline */ }
  }, [])

  // Polling status do bot
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [waRes, emailRes] = await Promise.all([
          authFetch(`${BOT_URL}/api/whatsapp/status`).then(r => r.json()),
          authFetch(`${BOT_URL}/api/email/status`).then(r => r.json()),
        ])
        setWaStatus(waRes)
        setEmailStatus(emailRes)
        setBotOnline(true)
        setWaError(null)

        if (!configLoadedRef.current) loadConfig()

        if (waRes.status === 'qr' || waRes.status === 'connecting') {
          const qrRes: QRResponse = await authFetch(`${BOT_URL}/api/whatsapp/qr`).then(r => r.json())
          setQrData(qrRes.qr)
        } else {
          setQrData(null)
        }
      } catch (err: any) {
        if (err?.message === 'AUTH_EXPIRED') {
          setAuthError('Sessão expirada. Faça login novamente.')
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
        if (err?.message === 'FORBIDDEN') {
          setAuthError('Acesso restrito. Apenas gerentes podem acessar Integrações.')
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
        setBotOnline(false)
        setAuthError(null)
      }
    }

    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadConfig])

  const handleConnect = async () => {
    setWaLoading(true)
    setWaError(null)
    try {
      const res = await authFetch(`${BOT_URL}/api/whatsapp/connect`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) setWaError(data.error || 'Erro ao conectar')
    } catch {
      setWaError('Bot offline. Inicie o backend primeiro.')
    } finally {
      setWaLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setWaLoading(true)
    try {
      await authFetch(`${BOT_URL}/api/whatsapp/disconnect`, { method: 'POST' })
      setQrData(null)
    } catch {
      setWaError('Erro ao desconectar.')
    } finally {
      setWaLoading(false)
    }
  }

  const handleSaveEmailConfig = async () => {
    setEmailSaving(true)
    setEmailMsg(null)
    try {
      const res = await authFetch(`${BOT_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailHost: emailForm.emailHost,
          emailPort: emailForm.emailPort,
          emailUser: emailForm.emailUser,
          emailPass: emailForm.emailPass,
          emailFrom: emailForm.emailFrom,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEmailMsg({ type: 'success', text: data.emailConfigured ? 'Configurado e ativo!' : 'Salvo (verifique os dados).' })
        if (data.config) {
          setEmailForm(prev => ({ ...prev, emailPass: data.config.emailPass || '' }))
        }
      } else {
        setEmailMsg({ type: 'error', text: data.error || 'Erro ao salvar.' })
      }
    } catch {
      setEmailMsg({ type: 'error', text: 'Bot offline.' })
    } finally {
      setEmailSaving(false)
    }
  }

  const handleTestEmail = async () => {
    setEmailMsg(null)
    try {
      const res = await authFetch(`${BOT_URL}/api/email/test`, { method: 'POST' })
      const data = await res.json()
      setEmailMsg(data.success ? { type: 'success', text: 'Conexao SMTP OK!' } : { type: 'error', text: `Erro: ${data.error}` })
    } catch {
      setEmailMsg({ type: 'error', text: 'Bot offline.' })
    }
  }

  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}min`
  }

  const otherIntegrations = [
    { id: 3, nome: 'LinkedIn', icon: '💼', desc: 'Conecte com leads e envie mensagens pelo LinkedIn' },
    { id: 4, nome: 'Instagram Business', icon: '📸', desc: 'Gerencie DMs e interacoes do Instagram Business' },
    { id: 5, nome: 'Facebook Pages', icon: '👥', desc: 'Integre com Facebook Pages e Messenger' },
    { id: 6, nome: 'Google Sheets', icon: '📊', desc: 'Exporte e importe dados via Google Sheets' },
    { id: 7, nome: 'Zapier', icon: '⚡', desc: 'Conecte com 5000+ apps via Zapier' },
    { id: 8, nome: 'Webhooks', icon: '🔗', desc: 'Configure webhooks personalizados' },
  ]

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none transition-colors'
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Integrações</h1>
        <p className="mt-1 text-sm text-gray-600">Conecte o CRM com suas ferramentas favoritas</p>
      </div>

      {/* Auth Error Banner */}
      {authError && (
        <div className="bg-red-50 border border-red-200 rounded-apple p-4">
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-lg">🔒</span>
            <div>
              <p className="text-sm font-medium text-red-800">{authError}</p>
              <p className="text-xs text-red-600 mt-0.5">Recarregue a página ou faça login novamente.</p>
            </div>
          </div>
        </div>
      )}

      {/* Bot Status Banner */}
      {!botOnline && !authError && (
        <div className="bg-yellow-50 rounded-apple border-2 border-yellow-200 p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-yellow-800">Bot Backend Offline</p>
              <p className="text-xs text-yellow-700 mt-0.5">
                Inicie o backend: <code className="bg-yellow-100 px-1.5 py-0.5 rounded text-xs">cd backend && npm run dev</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ WHATSAPP CARD ═══════════════ */}
      <div className="bg-white rounded-apple shadow-apple-sm border-2 border-green-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-4xl">💬</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">WhatsApp Bot CRM</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                waStatus.connected ? 'bg-green-500 animate-pulse' :
                waStatus.status === 'qr' ? 'bg-yellow-400 animate-pulse' :
                waStatus.status === 'connecting' ? 'bg-blue-400 animate-pulse' :
                'bg-gray-300'
              }`} />
              <span className="text-sm text-gray-600">
                {waStatus.connected ? `Conectado — ${waStatus.number}` :
                 waStatus.status === 'qr' ? 'Aguardando escaneamento do QR Code' :
                 waStatus.status === 'connecting' ? 'Conectando...' :
                 'Desconectado'}
              </span>
              {waStatus.connected && (
                <span className="text-xs text-gray-400 ml-2">Uptime: {formatUptime(waStatus.uptime)}</span>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Conecte o WhatsApp da empresa escaneando o QR Code. Os vendedores enviam mensagens para este número para usar o bot.
        </p>

        {/* QR Code Display */}
        {qrData && (
          <div className="flex flex-col items-center py-4 mb-4 bg-gray-50 rounded-apple border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-3">Escaneie o QR Code com o WhatsApp</p>
            <img src={qrData} alt="WhatsApp QR Code" className="w-64 h-64 rounded-lg shadow-md" />
            <p className="text-xs text-gray-500 mt-3">WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
          </div>
        )}

        {/* Connected info */}
        {waStatus.connected && (
          <div className="bg-green-50 rounded-apple border border-green-200 p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="text-sm font-semibold text-green-800">WhatsApp ativo no numero {waStatus.number}</span>
            </div>
            <p className="text-xs text-green-700">
              Vendedores ja podem enviar mensagens para este numero e usar o bot.
            </p>
            <p className="text-xs text-green-600 mt-1">
              Para trocar o numero, desconecte e escaneie o QR com outro celular.
            </p>
          </div>
        )}

        {waError && (
          <div className="bg-red-50 rounded-apple border border-red-200 p-3 mb-4 text-sm text-red-700">
            {waError}
          </div>
        )}

        <div className="flex gap-3">
          {!waStatus.connected ? (
            <button
              onClick={handleConnect}
              disabled={waLoading || !botOnline || waStatus.status === 'connecting' || waStatus.status === 'qr'}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-apple shadow-apple-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {waLoading ? 'Conectando...' : waStatus.status === 'qr' ? 'Aguardando QR...' : 'Conectar WhatsApp'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={waLoading}
              className="flex-1 px-4 py-2.5 bg-red-50 text-red-700 border-2 border-red-200 rounded-apple shadow-apple-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {waLoading ? 'Desconectando...' : 'Desconectar WhatsApp'}
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════ EMAIL CONFIG CARD ═══════════════ */}
      <div className="bg-white rounded-apple shadow-apple-sm border-2 border-red-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-4xl">📧</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Email (SMTP)</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${emailStatus.configured ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-600">
                {emailStatus.configured ? `Ativo — ${emailStatus.from}` : 'Nao configurado'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowEmailForm(!showEmailForm)}
            disabled={!botOnline}
            className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-apple hover:bg-primary-100 transition-colors disabled:opacity-50"
          >
            {showEmailForm ? 'Fechar' : 'Configurar'}
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Configure o email SMTP para enviar emails automatizados para clientes. Cada envio e registrado como interacao no CRM.
        </p>

        {/* Email Config Form */}
        {showEmailForm && (
          <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 mb-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Configuração SMTP</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Servidor SMTP</label>
                <input
                  type="text"
                  value={emailForm.emailHost}
                  onChange={e => setEmailForm(prev => ({ ...prev, emailHost: e.target.value }))}
                  placeholder="smtp.gmail.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Porta</label>
                <input
                  type="text"
                  value={emailForm.emailPort}
                  onChange={e => setEmailForm(prev => ({ ...prev, emailPort: e.target.value }))}
                  placeholder="587"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email (usuario SMTP)</label>
              <input
                type="email"
                value={emailForm.emailUser}
                onChange={e => setEmailForm(prev => ({ ...prev, emailUser: e.target.value }))}
                placeholder="vendas@suaempresa.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Senha / Senha de App</label>
              <input
                type="password"
                value={emailForm.emailPass}
                onChange={e => setEmailForm(prev => ({ ...prev, emailPass: e.target.value }))}
                placeholder="Senha de app do Google (16 caracteres)"
                className={inputClass}
              />
              <p className="text-xs text-gray-500 mt-1">
                Gmail: use uma <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">Senha de App</a> (requer verificação 2 etapas)
              </p>
            </div>

            <div>
              <label className={labelClass}>Nome do remetente</label>
              <input
                type="text"
                value={emailForm.emailFrom}
                onChange={e => setEmailForm(prev => ({ ...prev, emailFrom: e.target.value }))}
                placeholder="Grupo MF Paris <vendas@suaempresa.com>"
                className={inputClass}
              />
            </div>

            {emailMsg && (
              <div className={`rounded-apple border p-3 text-sm ${emailMsg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                {emailMsg.text}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSaveEmailConfig}
                disabled={emailSaving || !emailForm.emailHost || !emailForm.emailUser}
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-apple shadow-apple-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailSaving ? 'Salvando...' : 'Salvar Configuração'}
              </button>
              {emailStatus.configured && (
                <button
                  onClick={handleTestEmail}
                  className="px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-apple font-semibold hover:bg-green-100 transition-colors"
                >
                  Testar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status when form is closed */}
        {!showEmailForm && emailStatus.configured && (
          <div className="bg-green-50 rounded-apple border border-green-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">✅</span>
              <span className="text-sm text-green-800">Email ativo: {emailStatus.from}</span>
            </div>
          </div>
        )}

        {!showEmailForm && !emailStatus.configured && botOnline && (
          <div className="bg-yellow-50 rounded-apple border border-yellow-200 p-3">
            <p className="text-xs text-yellow-700">
              Clique em <strong>Configurar</strong> para cadastrar o email SMTP da empresa.
            </p>
          </div>
        )}
      </div>

      {/* ═══════════════ OTHER INTEGRATIONS ═══════════════ */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Outras Integrações</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherIntegrations.map((int) => (
            <div key={int.id} className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-6 hover:border-primary-300 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-4xl">{int.icon}</div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{int.nome}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs text-gray-600">Disponível</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-3">{int.desc}</p>
              <button className="mt-4 w-full px-4 py-2 rounded-apple shadow-apple-sm font-semibold bg-primary-50 text-primary-700 border-2 border-primary-200 hover:bg-primary-100 transition-colors">
                Configurar
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════ COMMANDS REFERENCE ═══════════════ */}
      <div className="bg-blue-50 rounded-apple border-2 border-blue-200 p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">💡</div>
          <div>
            <h3 className="text-lg font-semibold text-blue-900">Comandos do Bot WhatsApp</h3>
            <p className="text-sm text-blue-700 mt-2">
              Depois de conectado, os vendedores enviam uma mensagem para o numero e usam estes comandos:
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-blue-800">
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">login email senha</code> — Fazer login</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">1</code> — Meus clientes</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">2</code> — Novo cliente</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">3</code> — Registrar venda</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">4</code> — Minhas tarefas</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">5</code> — Meu pipeline</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">6</code> — Buscar cliente</div>
              <div><code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">0</code> — Sair</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default IntegracoesView
