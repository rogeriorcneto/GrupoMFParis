import React, { useState, useEffect, useCallback } from 'react'
import {
  omieGetConfig, omieSaveConfig, omieGetStatus, omieGetModules,
  omieApiCall, omieSyncDiff, omieSyncPull, omieSyncPush,
  type OmieConfig, type OmieStatus, type OmieModuleInfo,
  type SyncDiffResult, type SyncPullResult, type SyncPushResult,
} from '../../lib/omieApi'

// ─── Ícones por grupo ───
const GROUP_ICONS: Record<string, string> = {
  geral: '📋',
  crm: '🤝',
  financas: '💰',
  compras: '🛒',
  estoque: '📦',
  vendas: '🧾',
}

const GROUP_LABELS: Record<string, string> = {
  geral: 'Geral',
  crm: 'CRM',
  financas: 'Finanças',
  compras: 'Compras, Estoque e Produção',
  estoque: 'Estoque',
  vendas: 'Vendas e NF-e',
}

interface Props {
  botOnline: boolean
}

const OmieIntegration: React.FC<Props> = ({ botOnline }) => {
  // Config state
  const [config, setConfig] = useState<OmieConfig | null>(null)
  const [appKey, setAppKey] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Status state
  const [status, setStatus] = useState<OmieStatus | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)

  // Modules state
  const [modules, setModules] = useState<Record<string, OmieModuleInfo[]> | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState<{ group: string; mod: OmieModuleInfo } | null>(null)

  // Module call state
  const [callLoading, setCallLoading] = useState(false)
  const [callResult, setCallResult] = useState<any>(null)
  const [callError, setCallError] = useState<string | null>(null)
  const [callParams, setCallParams] = useState('{}')

  // Sync state
  const [syncTab, setSyncTab] = useState<'none' | 'diff' | 'pull' | 'push'>('none')
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncDiff, setSyncDiff] = useState<SyncDiffResult | null>(null)
  const [syncPullResult, setSyncPullResult] = useState<SyncPullResult | null>(null)
  const [syncPushResult, setSyncPushResult] = useState<SyncPushResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Load config on mount
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await omieGetConfig()
      setConfig(cfg)
      if (cfg.configured) {
        const st = await omieGetStatus()
        setStatus(st)
        const mods = await omieGetModules()
        setModules(mods)
      }
    } catch { /* bot offline */ }
  }, [])

  useEffect(() => {
    if (botOnline) loadConfig()
  }, [botOnline, loadConfig])

  // Save config
  const handleSaveConfig = async () => {
    setConfigSaving(true)
    setConfigMsg(null)
    try {
      const result = await omieSaveConfig(appKey, appSecret)
      if (result.success) {
        setConfigMsg({ type: 'success', text: `Conectado! ${result.empresa || ''}` })
        setShowConfigForm(false)
        setAppKey('')
        setAppSecret('')
        await loadConfig()
      } else {
        setConfigMsg({ type: 'error', text: result.error || 'Erro ao salvar.' })
      }
    } catch {
      setConfigMsg({ type: 'error', text: 'Bot offline.' })
    } finally {
      setConfigSaving(false)
    }
  }

  // Test connection
  const handleTestConnection = async () => {
    setTestingConnection(true)
    try {
      const st = await omieGetStatus()
      setStatus(st)
    } catch {
      setStatus({ success: false, error: 'Bot offline' })
    } finally {
      setTestingConnection(false)
    }
  }

  // Module call
  const handleModuleCall = async (group: string, moduleKey: string, action: string) => {
    setCallLoading(true)
    setCallResult(null)
    setCallError(null)
    try {
      let params: any = {}
      try { params = JSON.parse(callParams) } catch { params = {} }

      // For list actions, add pagination defaults
      if (action === 'listar' || action === 'listarResumido') {
        if (!params.pagina) params.pagina = 1
        if (!params.registros_por_pagina) params.registros_por_pagina = 50
      }

      const result = await omieApiCall(group, moduleKey, action, params)
      if (result.success) {
        setCallResult(result.data)
      } else {
        setCallError(result.error || 'Erro na chamada')
      }
    } catch (err: any) {
      setCallError(err.message || 'Erro')
    } finally {
      setCallLoading(false)
    }
  }

  // Sync handlers
  const handleSyncDiff = async () => {
    setSyncTab('diff')
    setSyncLoading(true)
    setSyncError(null)
    setSyncDiff(null)
    try {
      const result = await omieSyncDiff()
      if (result.success && result.data) {
        setSyncDiff(result.data)
      } else {
        setSyncError(result.error || 'Erro ao calcular diferenças')
      }
    } catch (err: any) {
      setSyncError(err.message)
    } finally {
      setSyncLoading(false)
    }
  }

  const handleSyncPull = async () => {
    setSyncTab('pull')
    setSyncLoading(true)
    setSyncError(null)
    setSyncPullResult(null)
    try {
      const result = await omieSyncPull()
      if (result.success && result.data) {
        setSyncPullResult(result.data)
      } else {
        setSyncError(result.error || 'Erro ao importar')
      }
    } catch (err: any) {
      setSyncError(err.message)
    } finally {
      setSyncLoading(false)
    }
  }

  const handleSyncPush = async () => {
    setSyncTab('push')
    setSyncLoading(true)
    setSyncError(null)
    setSyncPushResult(null)
    try {
      const result = await omieSyncPush()
      if (result.success && result.data) {
        setSyncPushResult(result.data)
      } else {
        setSyncError(result.error || 'Erro ao exportar')
      }
    } catch (err: any) {
      setSyncError(err.message)
    } finally {
      setSyncLoading(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none transition-colors'
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1'
  const btnPrimary = 'px-4 py-2.5 bg-primary-600 text-white rounded-apple shadow-apple-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const btnSecondary = 'px-4 py-2.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-apple font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50'

  return (
    <div className="bg-white rounded-apple shadow-apple-sm border-2 border-blue-200 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="text-4xl">🔗</div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">Omie ERP</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${
              status?.success ? 'bg-green-500 animate-pulse' :
              config?.configured ? 'bg-yellow-400' :
              'bg-gray-300'
            }`} />
            <span className="text-sm text-gray-600">
              {status?.success ? `Conectado — ${status.empresa || 'Omie'}` :
               config?.configured ? 'Configurado (verificando...)' :
               'Não configurado'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowConfigForm(!showConfigForm)}
          disabled={!botOnline}
          className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-apple hover:bg-primary-100 transition-colors disabled:opacity-50"
        >
          {showConfigForm ? 'Fechar' : config?.configured ? 'Reconfigurar' : 'Configurar'}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Integre com o Omie ERP para sincronizar clientes, fornecedores, produtos, pedidos, finanças e muito mais.
      </p>

      {/* ═══ CONFIG FORM ═══ */}
      {showConfigForm && (
        <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 mb-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Credenciais do Aplicativo Omie</h4>
          <p className="text-xs text-gray-500">
            Obtenha suas credenciais em{' '}
            <a href="https://developer.omie.com.br/my-apps/" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
              developer.omie.com.br/my-apps
            </a>
          </p>

          <div>
            <label className={labelClass}>App Key</label>
            <input
              type="text"
              value={appKey}
              onChange={e => setAppKey(e.target.value)}
              placeholder="Ex: 1234567890"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>App Secret</label>
            <input
              type="password"
              value={appSecret}
              onChange={e => setAppSecret(e.target.value)}
              placeholder="Sua chave secreta"
              className={inputClass}
            />
          </div>

          {configMsg && (
            <div className={`rounded-apple border p-3 text-sm ${configMsg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              {configMsg.text}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSaveConfig}
              disabled={configSaving || !appKey || !appSecret}
              className={`flex-1 ${btnPrimary}`}
            >
              {configSaving ? 'Testando e salvando...' : 'Salvar e Testar'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ CONNECTED STATUS ═══ */}
      {!showConfigForm && config?.configured && status?.success && (
        <div className="bg-green-50 rounded-apple border border-green-200 p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">✅</span>
              <span className="text-sm text-green-800">Conectado ao Omie: {status.empresa}</span>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="text-xs text-green-700 hover:text-green-900 underline"
            >
              {testingConnection ? 'Testando...' : 'Testar'}
            </button>
          </div>
        </div>
      )}

      {!showConfigForm && config?.configured && status && !status.success && (
        <div className="bg-red-50 rounded-apple border border-red-200 p-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">❌</span>
            <span className="text-sm text-red-700">Erro: {status.error}</span>
          </div>
        </div>
      )}

      {!showConfigForm && !config?.configured && botOnline && (
        <div className="bg-yellow-50 rounded-apple border border-yellow-200 p-3 mb-4">
          <p className="text-xs text-yellow-700">
            Clique em <strong>Configurar</strong> para inserir App Key e App Secret do Omie.
          </p>
        </div>
      )}

      {/* ═══ SYNC SECTION ═══ */}
      {config?.configured && status?.success && (
        <div className="border-t border-gray-200 pt-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Sincronização de Clientes</h4>
          <div className="flex gap-2 mb-3">
            <button onClick={handleSyncDiff} disabled={syncLoading} className={btnSecondary}>
              {syncLoading && syncTab === 'diff' ? 'Calculando...' : 'Preview Diferenças'}
            </button>
            <button onClick={handleSyncPull} disabled={syncLoading} className={`${btnPrimary} bg-blue-600 hover:bg-blue-700`}>
              {syncLoading && syncTab === 'pull' ? 'Importando...' : 'Importar Omie → CRM'}
            </button>
            <button onClick={handleSyncPush} disabled={syncLoading} className={`${btnPrimary} bg-orange-600 hover:bg-orange-700`}>
              {syncLoading && syncTab === 'push' ? 'Exportando...' : 'Exportar CRM → Omie'}
            </button>
          </div>

          {syncError && (
            <div className="bg-red-50 border border-red-200 rounded-apple p-3 mb-3 text-sm text-red-700">{syncError}</div>
          )}

          {/* Diff Results */}
          {syncDiff && syncTab === 'diff' && (
            <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 rounded-apple p-3 border border-green-200">
                  <p className="text-2xl font-bold text-green-700">{syncDiff.novos.length}</p>
                  <p className="text-xs text-green-600">Novos (importar)</p>
                </div>
                <div className="bg-yellow-50 rounded-apple p-3 border border-yellow-200">
                  <p className="text-2xl font-bold text-yellow-700">{syncDiff.atualizados.length}</p>
                  <p className="text-xs text-yellow-600">Atualizados</p>
                </div>
                <div className="bg-gray-100 rounded-apple p-3 border border-gray-300">
                  <p className="text-2xl font-bold text-gray-600">{syncDiff.semAlteracao.length}</p>
                  <p className="text-xs text-gray-500">Sem alteração</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                Omie: {syncDiff.totalOmie} registros | CRM: {syncDiff.totalCrm} registros
              </p>
              {syncDiff.novos.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-1">Novos clientes ({syncDiff.novos.length}):</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {syncDiff.novos.slice(0, 20).map((item, i) => (
                      <div key={i} className="text-xs text-gray-600 bg-white px-2 py-1 rounded border">
                        {item.razaoSocial} — {item.cnpj || 'Sem CNPJ'}
                      </div>
                    ))}
                    {syncDiff.novos.length > 20 && (
                      <p className="text-xs text-gray-400">... e mais {syncDiff.novos.length - 20}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pull Results */}
          {syncPullResult && syncTab === 'pull' && (
            <div className="bg-blue-50 rounded-apple border border-blue-200 p-4">
              <p className="text-sm font-semibold text-blue-800 mb-2">Importação concluída!</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-green-700">{syncPullResult.inseridos}</p>
                  <p className="text-xs text-green-600">Inseridos</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-yellow-700">{syncPullResult.atualizados}</p>
                  <p className="text-xs text-yellow-600">Atualizados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600">{syncPullResult.erros.length}</p>
                  <p className="text-xs text-red-500">Erros</p>
                </div>
              </div>
              {syncPullResult.erros.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto">
                  {syncPullResult.erros.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e.cnpj}: {e.erro}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Push Results */}
          {syncPushResult && syncTab === 'push' && (
            <div className="bg-orange-50 rounded-apple border border-orange-200 p-4">
              <p className="text-sm font-semibold text-orange-800 mb-2">Exportação concluída!</p>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-green-700">{syncPushResult.enviados}</p>
                  <p className="text-xs text-green-600">Enviados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600">{syncPushResult.erros.length}</p>
                  <p className="text-xs text-red-500">Erros</p>
                </div>
              </div>
              {syncPushResult.erros.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto">
                  {syncPushResult.erros.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e.cnpj}: {e.erro}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODULE BROWSER ═══ */}
      {config?.configured && status?.success && modules && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Módulos Omie Disponíveis</h4>

          {/* Group Tabs */}
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.keys(modules).map(group => (
              <button
                key={group}
                onClick={() => { setActiveGroup(activeGroup === group ? null : group); setActiveModule(null); setCallResult(null); setCallError(null) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-apple border transition-colors ${
                  activeGroup === group
                    ? 'bg-primary-100 border-primary-300 text-primary-800'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {GROUP_ICONS[group] || '📄'} {GROUP_LABELS[group] || group}
              </button>
            ))}
          </div>

          {/* Module List */}
          {activeGroup && modules[activeGroup] && (
            <div className="bg-gray-50 rounded-apple border border-gray-200 p-3 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {modules[activeGroup].map(mod => (
                  <button
                    key={mod.key}
                    onClick={() => { setActiveModule({ group: activeGroup, mod }); setCallResult(null); setCallError(null); setCallParams('{}') }}
                    className={`text-left p-2 rounded-apple border text-xs transition-colors ${
                      activeModule?.mod.key === mod.key
                        ? 'bg-primary-50 border-primary-300'
                        : 'bg-white border-gray-200 hover:border-primary-200'
                    }`}
                  >
                    <p className="font-medium text-gray-800">{mod.label}</p>
                    <p className="text-gray-500 mt-0.5 line-clamp-1">{mod.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Module Detail / Call */}
          {activeModule && (
            <div className="bg-white rounded-apple border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className="text-sm font-semibold text-gray-800">{activeModule.mod.label}</h5>
                  <p className="text-xs text-gray-500">{activeModule.mod.description}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {activeModule.mod.methods.map(action => (
                  <button
                    key={action}
                    onClick={() => handleModuleCall(activeModule.group, activeModule.mod.key, action)}
                    disabled={callLoading}
                    className={`px-3 py-1.5 text-xs font-medium rounded-apple transition-colors ${
                      action.startsWith('listar') || action === 'consultar' || action === 'obter' || action === 'pesquisar' || action === 'resumo'
                        ? 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100'
                        : action.startsWith('incluir') || action === 'upsert' || action === 'upsertCnpj' || action === 'gerar' || action === 'adicionar'
                        ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                        : action.startsWith('alterar')
                        ? 'bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100'
                        : action.startsWith('excluir') || action === 'cancelar' || action === 'inutilizar'
                        ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                        : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {callLoading ? '...' : action}
                  </button>
                ))}
              </div>

              {/* Params */}
              <div className="mb-3">
                <label className={labelClass}>Parâmetros (JSON)</label>
                <textarea
                  value={callParams}
                  onChange={e => setCallParams(e.target.value)}
                  rows={3}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder='{"pagina": 1, "registros_por_pagina": 50}'
                />
              </div>

              {/* Error */}
              {callError && (
                <div className="bg-red-50 border border-red-200 rounded-apple p-3 mb-3 text-xs text-red-700">
                  {callError}
                </div>
              )}

              {/* Results */}
              {callResult && (
                <div className="bg-gray-50 border border-gray-200 rounded-apple p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">Resultado</span>
                    <button
                      onClick={() => setCallResult(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Limpar
                    </button>
                  </div>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-80 bg-white rounded p-2 border">
                    {JSON.stringify(callResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default OmieIntegration
