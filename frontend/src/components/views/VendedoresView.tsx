import React from 'react'
import { PlusIcon, XMarkIcon, ClockIcon } from '@heroicons/react/24/outline'
import type { Vendedor, Cliente } from '../../types'
import { fetchVendedorHistorico, type VendedorHistoricoItem } from '../../lib/botApi'
import { formatTelefone } from '../../utils/validators'

function getActiveSecs(id: number): number {
  const base = parseInt(localStorage.getItem(`crm_active_secs_${id}`) || '0', 10)
  const segStart = localStorage.getItem(`crm_segment_start_${id}`)
  if (!segStart) return base
  return base + Math.floor((Date.now() - new Date(segStart).getTime()) / 1000)
}

function formatSecs(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

function useOnlineStatus(vendedorIds: number[]): Record<number, boolean> {
  const [status, setStatus] = React.useState<Record<number, boolean>>(() => {
    const s: Record<number, boolean> = {}
    vendedorIds.forEach(id => { s[id] = !!localStorage.getItem(`crm_segment_start_${id}`) })
    return s
  })
  React.useEffect(() => {
    const update = () => {
      const s: Record<number, boolean> = {}
      vendedorIds.forEach(id => { s[id] = !!localStorage.getItem(`crm_segment_start_${id}`) })
      setStatus(s)
    }
    update()
    const tid = setInterval(update, 5000)
    return () => clearInterval(tid)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(vendedorIds)])
  return status
}

function useSessionTimer(vendedorId: number | null) {
  const [elapsed, setElapsed] = React.useState<number>(0)

  React.useEffect(() => {
    if (!vendedorId) { setElapsed(0); return }
    const tick = () => setElapsed(getActiveSecs(vendedorId))
    tick()
    const tid = setInterval(tick, 1000)
    return () => clearInterval(tid)
  }, [vendedorId])

  if (elapsed <= 0) return null
  return formatSecs(elapsed)
}

const VendedoresView: React.FC<{
  vendedores: Vendedor[]
  clientes: Cliente[]
  loggedUser: Vendedor | null
  onAddVendedor: (email: string, senha: string, v: Omit<Vendedor, 'id' | 'usuario' | 'senha'>) => void
  onUpdateVendedor: (v: Vendedor) => void
}> = ({ vendedores, clientes, loggedUser, onAddVendedor, onUpdateVendedor }) => {
  const [selectedVendedorId, setSelectedVendedorId] = React.useState<number | null>(null)
  const [showModal, setShowModal] = React.useState(false)
  const [newNome, setNewNome] = React.useState('')
  const [newEmail, setNewEmail] = React.useState('')
  const [newTelefone, setNewTelefone] = React.useState('')
  const [newCargo, setNewCargo] = React.useState<Vendedor['cargo']>('vendedor')
  const [newMetaVendas, setNewMetaVendas] = React.useState('150000')
  const [newMetaLeads, setNewMetaLeads] = React.useState('10')
  const [newMetaConversao, setNewMetaConversao] = React.useState('15')
  const [newSenha, setNewSenha] = React.useState('')
  const [addError, setAddError] = React.useState('')
  const [isAdding, setIsAdding] = React.useState(false)

  const [editingMetas, setEditingMetas] = React.useState(false)
  const [editMetaVendas, setEditMetaVendas] = React.useState('')
  const [editMetaLeads, setEditMetaLeads] = React.useState('')
  const [editMetaConversao, setEditMetaConversao] = React.useState('')
  const [historico, setHistorico] = React.useState<VendedorHistoricoItem[]>([])
  const [historicoLoading, setHistoricoLoading] = React.useState(false)

  const isManager = loggedUser?.cargo === 'gerente' || loggedUser?.cargo === 'sdr'
  const sessionTimer = useSessionTimer(isManager && selectedVendedorId ? selectedVendedorId : null)
  const onlineStatus = useOnlineStatus(isManager ? vendedores.map(v => v.id) : [])

  const selectedVendedor = vendedores.find(v => v.id === selectedVendedorId) ?? null

  React.useEffect(() => {
    if (!selectedVendedorId) { setHistorico([]); return }
    setHistoricoLoading(true)
    fetchVendedorHistorico(selectedVendedorId)
      .then(res => setHistorico(res.atividades))
      .catch(() => setHistorico([]))
      .finally(() => setHistoricoLoading(false))
  }, [selectedVendedorId])

  const getVendedorMetrics = (vendedor: Vendedor) => {
    const clientesVendedor = clientes.filter(c => c.vendedorId === vendedor.id)
    const totalLeads = clientesVendedor.length
    const valorPipeline = clientesVendedor.reduce((sum, c) => sum + (c.valorEstimado || 0), 0)
    const conversoes = clientesVendedor.filter(c => c.etapa === 'follow_up').length
    const taxaConversao = totalLeads > 0 ? (conversoes / totalLeads) * 100 : 0
    return { totalLeads, valorPipeline, conversoes, taxaConversao, clientesVendedor }
  }

  const ranking = [...vendedores]
    .filter(v => v.ativo)
    .map(v => ({ ...v, metrics: getVendedorMetrics(v) }))
    .sort((a, b) => b.metrics.valorPipeline - a.metrics.valorPipeline)

  const getCargoLabel = (cargo: Vendedor['cargo']) => {
    switch (cargo) { case 'gerente': return 'Gerente'; case 'sdr': return 'SDR'; default: return 'Vendedor' }
  }
  const getCargoBadge = (cargo: Vendedor['cargo']) => {
    switch (cargo) { case 'gerente': return 'bg-purple-100 text-purple-800'; case 'sdr': return 'bg-blue-100 text-blue-800'; default: return 'bg-green-100 text-green-800' }
  }
  const getBarColor = (pct: number) => {
    if (pct >= 100) return 'bg-green-500'; if (pct >= 75) return 'bg-blue-500'; if (pct >= 50) return 'bg-yellow-500'; return 'bg-red-500'
  }

  const handleAddVendedor = async () => {
    if (!newNome.trim() || !newEmail.trim() || !newSenha.trim()) return
    if (newSenha.trim().length < 6) { setAddError('Senha deve ter pelo menos 6 caracteres'); return }
    setAddError('')
    setIsAdding(true)
    try {
      const initials = newNome.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
      await onAddVendedor(newEmail.trim(), newSenha.trim(), {
        nome: newNome.trim(), email: newEmail.trim(), telefone: newTelefone.trim(),
        cargo: newCargo, avatar: initials,
        metaVendas: Number(newMetaVendas) || 150000, metaLeads: Number(newMetaLeads) || 10,
        metaConversao: Number(newMetaConversao) || 15, ativo: true
      })
      setNewNome(''); setNewEmail(''); setNewTelefone(''); setNewSenha(''); setShowModal(false)
    } catch (err: any) {
      setAddError(err?.message || 'Erro ao cadastrar vendedor')
    } finally {
      setIsAdding(false)
    }
  }

  const handleSaveMetas = () => {
    if (!selectedVendedor) return
    onUpdateVendedor({
      ...selectedVendedor,
      metaVendas: Number(editMetaVendas) || selectedVendedor.metaVendas,
      metaLeads: Number(editMetaLeads) || selectedVendedor.metaLeads,
      metaConversao: Number(editMetaConversao) || selectedVendedor.metaConversao
    })
    setEditingMetas(false)
  }

  if (selectedVendedor) {
    const m = getVendedorMetrics(selectedVendedor)
    const pctVendas = Math.min((m.valorPipeline / selectedVendedor.metaVendas) * 100, 100)
    const pctLeads = Math.min((m.totalLeads / selectedVendedor.metaLeads) * 100, 100)
    const pctConversao = Math.min((m.taxaConversao / selectedVendedor.metaConversao) * 100, 100)

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedVendedorId(null)} className="px-3 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm font-medium text-gray-700">← Voltar</button>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Perfil do Vendedor</h1>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl sm:text-2xl font-bold text-primary-700">{selectedVendedor.avatar}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">{selectedVendedor.nome}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getCargoBadge(selectedVendedor.cargo)}`}>{getCargoLabel(selectedVendedor.cargo)}</span>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${selectedVendedor.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{selectedVendedor.ativo ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-1 sm:gap-6 mt-3 text-sm text-gray-600">
                <span className="truncate">📧 {selectedVendedor.email}</span>
                <span>📞 {selectedVendedor.telefone}</span>
              </div>
            </div>
            <button onClick={() => onUpdateVendedor({ ...selectedVendedor, ativo: !selectedVendedor.ativo })} className={`px-4 py-2 rounded-apple text-sm font-semibold self-start ${selectedVendedor.ativo ? 'bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {selectedVendedor.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>

        {/* Session Timer — visible only to manager */}
        {isManager && (
          <div className={`rounded-apple border p-4 flex items-center justify-between ${
            sessionTimer
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                sessionTimer ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <div>
                <p className="text-sm font-semibold text-gray-800">⏱️ Tempo no CRM hoje</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {sessionTimer ? 'Sessão ativa agora' : 'Fora do sistema'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold font-mono tracking-tight ${
                sessionTimer ? 'text-green-700' : 'text-gray-400'
              }`}>
                {sessionTimer ?? '--:--'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🔐 Credenciais de Acesso</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-apple border border-gray-200 bg-gray-50"><p className="text-xs text-gray-500">Email (login)</p><p className="text-sm font-semibold text-gray-900 mt-1">{selectedVendedor.email}</p></div>
            <div className="p-3 rounded-apple border border-gray-200 bg-gray-50"><p className="text-xs text-gray-500">Senha</p><p className="text-sm font-semibold text-gray-900 mt-1">••••••••</p><p className="text-[10px] text-gray-400 mt-1">Gerenciada pelo Supabase Auth</p></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4"><p className="text-sm text-gray-600">Clientes</p><p className="text-2xl font-bold text-gray-900">{m.totalLeads}</p></div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4"><p className="text-sm text-gray-600">Pipeline</p><p className="text-2xl font-bold text-gray-900">R$ {m.valorPipeline.toLocaleString('pt-BR')}</p></div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4"><p className="text-sm text-gray-600">Conversões</p><p className="text-2xl font-bold text-green-600">{m.conversoes}</p></div>
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4"><p className="text-sm text-gray-600">Taxa Conversão</p><p className="text-2xl font-bold text-purple-600">{m.taxaConversao.toFixed(1)}%</p></div>
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">🎯 Metas Individuais</h3>
            {!editingMetas ? (
              <button onClick={() => { setEditingMetas(true); setEditMetaVendas(String(selectedVendedor.metaVendas)); setEditMetaLeads(String(selectedVendedor.metaLeads)); setEditMetaConversao(String(selectedVendedor.metaConversao)) }} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-apple hover:bg-gray-50 font-medium">✏️ Editar Metas</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingMetas(false)} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
                <button onClick={handleSaveMetas} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-apple hover:bg-primary-700">Salvar</button>
              </div>
            )}
          </div>
          {editingMetas ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Meta Vendas (R$)</label><input type="number" value={editMetaVendas} onChange={(e) => setEditMetaVendas(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Meta Leads</label><input type="number" value={editMetaLeads} onChange={(e) => setEditMetaLeads(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Meta Conversão (%)</label><input type="number" value={editMetaConversao} onChange={(e) => setEditMetaConversao(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-600">💰 Vendas</p><p className="text-sm font-bold text-gray-900">R$ {m.valorPipeline.toLocaleString('pt-BR')} / {selectedVendedor.metaVendas.toLocaleString('pt-BR')}</p></div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"><div className={`h-3 rounded-full transition-all duration-500 ${getBarColor(pctVendas)}`} style={{ width: `${pctVendas}%` }}></div></div>
                <p className="text-xs text-gray-500 mt-1">{pctVendas.toFixed(0)}% da meta</p>
              </div>
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-600">📋 Leads</p><p className="text-sm font-bold text-gray-900">{m.totalLeads} / {selectedVendedor.metaLeads}</p></div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"><div className={`h-3 rounded-full transition-all duration-500 ${getBarColor(pctLeads)}`} style={{ width: `${pctLeads}%` }}></div></div>
                <p className="text-xs text-gray-500 mt-1">{pctLeads.toFixed(0)}% da meta</p>
              </div>
              <div className="p-4 rounded-apple border border-gray-200">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-600">🔄 Conversão</p><p className="text-sm font-bold text-gray-900">{m.taxaConversao.toFixed(1)}% / {selectedVendedor.metaConversao}%</p></div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"><div className={`h-3 rounded-full transition-all duration-500 ${getBarColor(pctConversao)}`} style={{ width: `${pctConversao}%` }}></div></div>
                <p className="text-xs text-gray-500 mt-1">{pctConversao.toFixed(0)}% da meta</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200"><h3 className="text-lg font-semibold text-gray-900">Clientes Atribuídos ({m.clientesVendedor.length})</h3></div>
          <div className="p-6">
            {m.clientesVendedor.length === 0 ? <p className="text-gray-500 text-sm">Nenhum cliente atribuído a este vendedor.</p> : (
              <div className="space-y-2">
                {m.clientesVendedor.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-apple border border-gray-200">
                    <div><p className="font-medium text-sm text-gray-900">{c.razaoSocial}</p><p className="text-xs text-gray-500">{c.contatoNome} • {c.etapa}</p></div>
                    <div className="text-right"><p className="text-sm font-semibold text-gray-900">R$ {(c.valorEstimado || 0).toLocaleString('pt-BR')}</p><p className="text-xs text-gray-500">Score: {c.score || 0}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Histórico de Atividades do Vendedor */}
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Histórico de Atividades</h3>
            <span className="text-sm text-gray-500 ml-auto">{historico.length} ação(ões)</span>
          </div>
          <div className="p-6">
            {historicoLoading ? (
              <p className="text-gray-500 text-sm text-center py-4">Carregando histórico...</p>
            ) : historico.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Nenhuma atividade registrada para este vendedor.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {historico.map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-apple border border-gray-200">
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {a.tipo === 'whatsapp' ? '📱' : a.tipo === 'email' ? '📧' : a.tipo === 'nota' ? '📝' : a.tipo === 'tarefa' ? '✅' : a.tipo === 'ia' ? '🤖' : a.tipo === 'ligacao' ? '📞' : '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{a.descricao}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(a.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Equipe de Vendas</h1>
          <p className="mt-1 text-sm text-gray-600">Gerencie sua equipe, acompanhe metas e performance individual</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center self-start">
          <PlusIcon className="h-4 w-4 mr-2" /> Novo Vendedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {vendedores.map(v => {
            const m = getVendedorMetrics(v)
            const pctVendas = Math.min((m.valorPipeline / v.metaVendas) * 100, 100)
            const isOnline = isManager && !!onlineStatus[v.id]
            return (
              <div key={v.id} onClick={() => setSelectedVendedorId(v.id)} className={`bg-white rounded-apple shadow-apple-sm border-2 p-6 hover:border-primary-300 transition-all cursor-pointer ${
                isOnline ? 'border-green-300' : 'border-gray-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${v.ativo ? 'bg-primary-100' : 'bg-gray-200'}`}>
                      <span className={`text-sm font-bold ${v.ativo ? 'text-primary-700' : 'text-gray-500'}`}>{v.avatar}</span>
                    </div>
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{v.nome}</h3>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getCargoBadge(v.cargo)}`}>{getCargoLabel(v.cargo)}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Clientes</span><span className="font-semibold text-gray-900">{m.totalLeads}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Pipeline</span><span className="font-semibold text-gray-900">R$ {m.valorPipeline.toLocaleString('pt-BR')}</span></div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span className="text-gray-500">Meta vendas</span><span className="font-semibold text-gray-700">{pctVendas.toFixed(0)}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className={`h-2 rounded-full ${getBarColor(pctVendas)}`} style={{ width: `${pctVendas}%` }}></div></div>
                  </div>
                </div>
                {isOnline && (
                  <p className="text-xs text-green-600 font-semibold mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                    Online agora
                  </p>
                )}
                {!v.ativo && <p className="text-xs text-red-500 mt-2 font-semibold">Inativo</p>}
              </div>
            )
          })}
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200"><h3 className="text-lg font-semibold text-gray-900">🏆 Ranking da Equipe</h3></div>
        <div className="p-6">
          <div className="space-y-3">
            {ranking.map((v, index) => {
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}º`
              return (
                <div key={v.id} className={`flex items-center gap-4 p-4 rounded-apple border-2 transition-all ${index === 0 ? 'bg-yellow-50 border-yellow-200' : index === 1 ? 'bg-gray-50 border-gray-300' : index === 2 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
                  <div className="text-2xl w-10 text-center font-bold">{medal}</div>
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center"><span className="text-sm font-bold text-primary-700">{v.avatar}</span></div>
                  <div className="flex-1"><p className="font-semibold text-gray-900">{v.nome}</p><p className="text-xs text-gray-500">{getCargoLabel(v.cargo)} • {v.metrics.totalLeads} clientes</p></div>
                  <div className="text-right"><p className="text-lg font-bold text-gray-900">R$ {v.metrics.valorPipeline.toLocaleString('pt-BR')}</p><p className="text-xs text-gray-500">Conversão: {v.metrics.taxaConversao.toFixed(1)}%</p></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Novo Vendedor</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label><input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome completo" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label><input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@empresa.com" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label><input type="tel" value={newTelefone} onChange={(e) => setNewTelefone(formatTelefone(e.target.value))} placeholder="(00) 99999-0000" maxLength={16} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label><select value={newCargo} onChange={(e) => setNewCargo(e.target.value as Vendedor['cargo'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="vendedor">Vendedor</option><option value="sdr">SDR</option><option value="gerente">Gerente</option></select></div>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">🔐 Credenciais de Acesso</p>
                <p className="text-xs text-gray-500 mb-3">O email acima será o login. Defina a senha abaixo (mínimo 6 caracteres).</p>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Senha *</label>
                  <input type="password" value={newSenha} onChange={(e) => setNewSenha(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                </div>
                {addError && <div className="mt-2 bg-red-50 border border-red-200 rounded-apple p-2 text-xs text-red-700">{addError}</div>}
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Metas Mensais</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-600 mb-1">Vendas (R$)</label><input type="number" value={newMetaVendas} onChange={(e) => setNewMetaVendas(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" /></div>
                  <div><label className="block text-xs text-gray-600 mb-1">Leads</label><input type="number" value={newMetaLeads} onChange={(e) => setNewMetaLeads(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" /></div>
                  <div><label className="block text-xs text-gray-600 mb-1">Conversão (%)</label><input type="number" value={newMetaConversao} onChange={(e) => setNewMetaConversao(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" /></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAddVendedor} disabled={isAdding || !newNome.trim() || !newEmail.trim() || !newSenha.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">{isAdding ? 'Cadastrando...' : 'Cadastrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VendedoresView
