import React from 'react'
import type { Cliente, Interacao, Vendedor, TemplateMsg } from '../../types'
import { startBulkSend, getBulkStatus, cancelBulkBatch, getBulkBatches } from '../../lib/botApi'
import type { BulkStatus } from '../../lib/botApi'

// ── Stage labels ──
const stageLabels: Record<string, string> = {
  'prospecção': 'Prospecção', amostra: 'Amostra', homologado: 'Homologado',
  negociacao: 'Negociação', pos_venda: 'Pós-venda', cliente_ativo: 'Cliente Ativo', perdido: 'Perdido',
}

interface AutomacoesViewProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  templates: TemplateMsg[]
  loggedUser: Vendedor | null
  showToast: (tipo: 'success' | 'error', texto: string) => void
  onAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
}

const AutomacoesView: React.FC<AutomacoesViewProps> = ({
  clientes, vendedores, templates, loggedUser, showToast, onAction,
}) => {
  // ── State ──
  const [tab, setTab] = React.useState<'massa' | 'individual' | 'historico'>('massa')
  const [canal, setCanal] = React.useState<'email' | 'whatsapp'>('email')
  const [filtroEtapa, setFiltroEtapa] = React.useState<string>('todas')
  const [filtroVendedor, setFiltroVendedor] = React.useState<string>('todos')
  const [filtroBusca, setFiltroBusca] = React.useState('')
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const [selectAll, setSelectAll] = React.useState(false)

  // Message composition
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<number>(0)
  const [useTemplate, setUseTemplate] = React.useState(false)

  // Progress
  const [activeBatchId, setActiveBatchId] = React.useState<string | null>(null)
  const [batchStatus, setBatchStatus] = React.useState<BulkStatus | null>(null)
  const [sending, setSending] = React.useState(false)
  const [batches, setBatches] = React.useState<BulkStatus[]>([])

  // Individual dispatch
  const [indSearch, setIndSearch] = React.useState('')
  const [indSelectedId, setIndSelectedId] = React.useState<number>(clientes[0]?.id ?? 0)

  // ── Filtered clients ──
  const filteredClientes = React.useMemo(() => {
    let list = clientes
    if (filtroEtapa !== 'todas') list = list.filter(c => c.etapa === filtroEtapa)
    if (filtroVendedor !== 'todos') list = list.filter(c => String(c.vendedorId) === filtroVendedor)
    if (filtroBusca.trim()) {
      const q = filtroBusca.toLowerCase().trim()
      list = list.filter(c =>
        c.razaoSocial.toLowerCase().includes(q) ||
        (c.contatoNome || '').toLowerCase().includes(q) ||
        (c.contatoEmail || '').toLowerCase().includes(q) ||
        (c.contatoTelefone || '').toLowerCase().includes(q)
      )
    }
    // Filter by valid contact info for selected channel
    if (canal === 'email') list = list.filter(c => c.contatoEmail && c.contatoEmail.includes('@'))
    else list = list.filter(c => c.whatsapp || c.contatoTelefone)
    return list
  }, [clientes, filtroEtapa, filtroVendedor, filtroBusca, canal])

  // Select all toggle
  React.useEffect(() => {
    if (selectAll) setSelectedIds(new Set(filteredClientes.map(c => c.id)))
    else setSelectedIds(new Set())
  }, [selectAll, filteredClientes])

  // Poll batch status
  React.useEffect(() => {
    if (!activeBatchId) return
    const interval = setInterval(async () => {
      const s = await getBulkStatus(activeBatchId)
      if (s) {
        setBatchStatus(s)
        if (s.status !== 'running') {
          clearInterval(interval)
          setSending(false)
          if (s.status === 'done') {
            showToast(s.failed === 0 ? 'success' : 'error',
              `Disparo concluído: ${s.sent} enviados, ${s.failed} falhas de ${s.total}`)
          }
        }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeBatchId])

  // Load batch history on historico tab
  React.useEffect(() => {
    if (tab === 'historico') {
      getBulkBatches().then(setBatches).catch(() => {})
    }
  }, [tab])

  // Template selected
  React.useEffect(() => {
    if (useTemplate && selectedTemplateId) {
      const tmpl = templates.find(t => t.id === selectedTemplateId)
      if (tmpl) {
        setBody(tmpl.conteudo)
      }
    }
  }, [selectedTemplateId, useTemplate, templates])

  // ── Handlers ──
  const handleStartBulk = async () => {
    const targets = filteredClientes
      .filter(c => selectedIds.has(c.id))
      .map(c => ({
        clienteId: c.id,
        to: canal === 'email' ? (c.contatoEmail || '') : (c.whatsapp || c.contatoTelefone || ''),
      }))
      .filter(t => t.to)

    if (targets.length === 0) { showToast('error', 'Nenhum destinatário selecionado'); return }
    if (!body.trim() && !selectedTemplateId) { showToast('error', 'Escreva uma mensagem ou selecione um template'); return }
    if (canal === 'email' && !subject.trim()) { showToast('error', 'Informe o assunto do email'); return }

    if (!window.confirm(`Disparar ${targets.length} ${canal === 'email' ? 'emails' : 'mensagens WhatsApp'}?\n\nEssa ação não pode ser desfeita.`)) return

    setSending(true)
    setBatchStatus(null)

    const result = await startBulkSend({
      canal,
      subject: canal === 'email' ? subject : undefined,
      body: body || undefined,
      templateId: useTemplate && selectedTemplateId ? selectedTemplateId : undefined,
      targets,
      vendedorNome: loggedUser?.nome || 'Sistema',
    })

    if (result.success && result.batchId) {
      setActiveBatchId(result.batchId)
      showToast('success', `Disparo iniciado! ${targets.length} destinatários na fila.`)
    } else {
      setSending(false)
      showToast('error', result.error || 'Erro ao iniciar disparo')
    }
  }

  const handleCancel = async () => {
    if (!activeBatchId) return
    await cancelBulkBatch(activeBatchId)
    showToast('error', 'Disparo cancelado')
    setSending(false)
  }

  const toggleId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Unique stages ──
  const etapas = React.useMemo(() => [...new Set(clientes.map(c => c.etapa))].sort(), [clientes])

  // Individual clients
  const indClientes = React.useMemo(() => {
    const q = indSearch.toLowerCase().trim()
    const list = q ? clientes.filter(c => c.razaoSocial.toLowerCase().includes(q) || (c.contatoNome || '').toLowerCase().includes(q)) : clientes
    return list.slice(0, 50)
  }, [clientes, indSearch])
  const indCliente = clientes.find(c => c.id === indSelectedId) ?? null

  const pct = batchStatus && batchStatus.total > 0 ? Math.round(((batchStatus.sent + batchStatus.failed) / batchStatus.total) * 100) : 0

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Automações de Vendas</h1>
          <p className="mt-1 text-sm text-gray-600">Disparo em massa de emails e WhatsApp + ações individuais rápidas</p>
        </div>
        <div className="flex gap-2">
          {(['massa', 'individual', 'historico'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-all ${tab === t ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}>
              {t === 'massa' ? '📨 Disparo em Massa' : t === 'individual' ? '👤 Individual' : '📋 Histórico'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TAB: Disparo em Massa ─── */}
      {tab === 'massa' && (
        <div className="space-y-4">
          {/* Progress bar (shown when sending) */}
          {(sending || batchStatus) && batchStatus && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {batchStatus.status === 'running' && <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
                  <span className="text-sm font-medium text-gray-900">
                    {batchStatus.status === 'running' ? 'Enviando...' : batchStatus.status === 'done' ? 'Concluído' : 'Cancelado'}
                  </span>
                </div>
                <span className="text-xs text-gray-600">
                  {batchStatus.sent} enviados · {batchStatus.failed} falhas · {batchStatus.total} total
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-primary-500 to-primary-600" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">{pct}%</span>
                {batchStatus.status === 'running' && (
                  <button onClick={handleCancel} className="text-xs text-red-600 hover:text-red-800 font-medium">Cancelar</button>
                )}
              </div>
              {batchStatus.errors.length > 0 && batchStatus.status !== 'running' && (
                <details className="mt-3">
                  <summary className="text-xs text-red-600 cursor-pointer font-medium">
                    {batchStatus.errors.length} erro(s) — clique para ver
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1">
                    {batchStatus.errors.map((e, i) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded p-2">
                        <span className="font-medium">{e.to}</span>: {e.error}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Canal + Filters */}
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: filters + audience */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">1. Canal e Audiência</h2>

                <div className="flex gap-2">
                  <button onClick={() => setCanal('email')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-apple transition-all ${canal === 'email' ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    📧 Email
                  </button>
                  <button onClick={() => setCanal('whatsapp')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-apple transition-all ${canal === 'whatsapp' ? 'bg-green-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    💬 WhatsApp
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Etapa</label>
                    <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-apple">
                      <option value="todas">Todas as etapas</option>
                      {etapas.map(e => <option key={e} value={e}>{stageLabels[e] || e}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor</label>
                    <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-apple">
                      <option value="todos">Todos</option>
                      {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={String(v.id)}>{v.nome}</option>)}
                    </select>
                  </div>
                </div>

                <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)}
                  placeholder="Buscar por nome, email, telefone..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent" />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={selectAll} onChange={e => setSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    Selecionar todos ({filteredClientes.length})
                  </label>
                  <span className="text-xs font-medium text-primary-600">{selectedIds.size} selecionado(s)</span>
                </div>

                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-apple divide-y divide-gray-100">
                  {filteredClientes.slice(0, 200).map(c => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleId(c.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">{c.razaoSocial}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {canal === 'email' ? c.contatoEmail : (c.whatsapp || c.contatoTelefone)} · {stageLabels[c.etapa] || c.etapa}
                        </div>
                      </div>
                    </label>
                  ))}
                  {filteredClientes.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-500">
                      Nenhum cliente com {canal === 'email' ? 'email' : 'telefone'} válido nesta seleção
                    </div>
                  )}
                  {filteredClientes.length > 200 && (
                    <div className="p-2 text-center text-xs text-gray-400">
                      Mostrando 200 de {filteredClientes.length}. Use filtros para refinar.
                    </div>
                  )}
                </div>
              </div>

              {/* Right: message composition */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">2. Mensagem</h2>

                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={useTemplate} onChange={e => setUseTemplate(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  Usar template salvo
                </label>

                {useTemplate && (
                  <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-apple">
                    <option value={0}>Selecione um template...</option>
                    {templates.filter(t => t.canal === canal || t.canal === 'todos').map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                )}

                {canal === 'email' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Assunto</label>
                    <input value={subject} onChange={e => setSubject(e.target.value)}
                      placeholder="Assunto do email... (use {'{nome}'} para personalizar)"
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {canal === 'email' ? 'Corpo do Email (HTML)' : 'Mensagem WhatsApp'}
                  </label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={8}
                    placeholder={canal === 'email'
                      ? 'Olá {nome}, temos novidades especiais para a {empresa}...'
                      : 'Olá {nome}! Aqui é da MF Paris. Temos condições especiais para você!'}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono" />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-apple p-3 text-xs text-blue-800">
                  <span className="font-semibold">Variáveis disponíveis:</span>{' '}
                  <code className="bg-blue-100 px-1 rounded">{'{nome}'}</code>{' '}
                  <code className="bg-blue-100 px-1 rounded">{'{empresa}'}</code>{' '}
                  <code className="bg-blue-100 px-1 rounded">{'{contato}'}</code>{' '}
                  <code className="bg-blue-100 px-1 rounded">{'{vendedor}'}</code>{' '}
                  <code className="bg-blue-100 px-1 rounded">{'{etapa}'}</code>
                </div>

                {canal === 'whatsapp' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-apple p-3 text-xs text-yellow-800">
                    ⚠️ <strong>Atenção:</strong> WhatsApp tem limite de envio. Disparos muito grandes podem resultar em bloqueio temporário.
                    Recomendamos máximo 100 mensagens por lote com intervalo de 3s entre envios.
                  </div>
                )}

                {/* Preview */}
                {(body || subject) && (
                  <div className="border border-gray-200 rounded-apple p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700 mb-1">Preview:</div>
                    {canal === 'email' && subject && (
                      <div className="text-xs text-gray-600 mb-1">
                        <span className="font-medium">Assunto:</span> {subject.replace(/\{nome\}/g, 'João').replace(/\{empresa\}/g, 'Empresa X')}
                      </div>
                    )}
                    <div className="text-xs text-gray-800 whitespace-pre-wrap" dangerouslySetInnerHTML={{
                      __html: body
                        .replace(/\{\{?nome\}?\}/g, '<strong>João</strong>')
                        .replace(/\{\{?empresa\}?\}/g, '<strong>Empresa X</strong>')
                        .replace(/\{\{?contato\}?\}/g, '<strong>Maria</strong>')
                        .replace(/\{\{?vendedor\}?\}/g, `<strong>${loggedUser?.nome || 'Vendedor'}</strong>`)
                        .replace(/\{\{?etapa\}?\}/g, '<strong>Negociação</strong>')
                    }} />
                  </div>
                )}

                {/* Send button */}
                <button onClick={handleStartBulk} disabled={sending || selectedIds.size === 0}
                  className={`w-full px-4 py-3 text-sm font-semibold rounded-apple transition-all shadow-apple-sm ${
                    sending || selectedIds.size === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : canal === 'email'
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                  }`}>
                  {sending
                    ? `Enviando... (${batchStatus?.sent || 0}/${batchStatus?.total || selectedIds.size})`
                    : `🚀 Disparar ${selectedIds.size} ${canal === 'email' ? 'email(s)' : 'mensagem(ns) WhatsApp'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: Individual ─── */}
      {tab === 'individual' && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Lead / Empresa</label>
              <input type="text" value={indSearch} onChange={e => setIndSearch(e.target.value)}
                placeholder="Buscar empresa..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-1 text-sm" />
              <select value={indSelectedId} onChange={e => { setIndSelectedId(Number(e.target.value)); setIndSearch('') }}
                size={Math.min(indClientes.length, 6)} className="w-full px-2 py-1 border border-gray-300 rounded-apple text-sm">
                {indClientes.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
              </select>
              {indCliente && (
                <div className="mt-4 rounded-apple border border-gray-200 bg-gray-50 p-4 space-y-1">
                  <div className="text-sm font-medium text-gray-900">{indCliente.razaoSocial}</div>
                  <div className="text-xs text-gray-600">Contato: {indCliente.contatoNome}</div>
                  <div className="text-xs text-gray-600">Email: {indCliente.contatoEmail}</div>
                  <div className="text-xs text-gray-600">WhatsApp: {indCliente.whatsapp || indCliente.contatoTelefone}</div>
                  <div className="text-xs text-gray-600">Etapa: {stageLabels[indCliente.etapa] || indCliente.etapa}</div>
                </div>
              )}
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">📢 Propaganda</div>
                  <div className="text-xs text-gray-600 mt-1">Disparo rápido (registrado no histórico).</div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'whatsapp', 'propaganda')} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-apple hover:bg-green-700 disabled:opacity-50">WhatsApp</button>
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'email', 'propaganda')} className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:opacity-50">Email</button>
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'instagram', 'propaganda')} className="px-3 py-1.5 text-xs bg-pink-600 text-white rounded-apple hover:bg-pink-700 disabled:opacity-50">Instagram</button>
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'linkedin', 'propaganda')} className="px-3 py-1.5 text-xs bg-blue-700 text-white rounded-apple hover:bg-blue-800 disabled:opacity-50">LinkedIn</button>
                  </div>
                </div>
                <div className="rounded-apple border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-900">📞 Contato</div>
                  <div className="text-xs text-gray-600 mt-1">Ação de contato (registrada no histórico).</div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'whatsapp', 'contato')} className="px-3 py-1.5 text-xs bg-white text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50 disabled:opacity-50">WhatsApp</button>
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'email', 'contato')} className="px-3 py-1.5 text-xs bg-white text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50 disabled:opacity-50">Email</button>
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'instagram', 'contato')} className="px-3 py-1.5 text-xs bg-white text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50 disabled:opacity-50">Instagram</button>
                    <button disabled={!indCliente} onClick={() => indCliente && onAction(indCliente, 'linkedin', 'contato')} className="px-3 py-1.5 text-xs bg-white text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50 disabled:opacity-50">LinkedIn</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: Histórico ─── */}
      {tab === 'historico' && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Histórico de Disparos em Massa</h2>
          {batches.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">Nenhum disparo realizado ainda.</div>
          ) : (
            <div className="space-y-3">
              {batches.map(b => (
                <div key={b.batchId} className="border border-gray-200 rounded-apple p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{b.canal === 'email' ? '📧' : '💬'}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {b.canal === 'email' ? 'Email' : 'WhatsApp'} — {b.total} destinatários
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      b.status === 'done' ? 'bg-green-100 text-green-800' :
                      b.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>{b.status === 'done' ? 'Concluído' : b.status === 'running' ? 'Enviando' : 'Cancelado'}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
                    <span>✅ {b.sent} enviados</span>
                    <span>❌ {b.failed} falhas</span>
                    <span>📅 {new Date(b.startedAt).toLocaleString('pt-BR')}</span>
                    {b.finishedAt && <span>⏱ {Math.round((new Date(b.finishedAt).getTime() - new Date(b.startedAt).getTime()) / 1000)}s</span>}
                  </div>
                  {b.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-600 cursor-pointer">{b.errors.length} erro(s)</summary>
                      <div className="mt-1 text-xs space-y-1 max-h-32 overflow-y-auto">
                        {b.errors.map((e, i) => (
                          <div key={i} className="bg-red-50 rounded p-1.5">{e.to}: {e.error}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AutomacoesView
