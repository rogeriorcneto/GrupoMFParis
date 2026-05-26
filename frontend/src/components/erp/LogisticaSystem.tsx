import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'
import OmieSyncButton from './OmieSyncButton'
import { syncTransportadorasOmie } from '../../lib/omieSync'
import PedidosOmieView from './PedidosOmieView'
import SyncOmieView from './SyncOmieView'

interface Transportadora {
  id: number
  nome: string
  cnpj?: string
  contato?: string
  telefone?: string
  email?: string
  ativo: boolean
}

interface Frete {
  id: number
  pedido_id?: number
  cliente_id?: number
  transportadora_id?: number
  codigo_rastreio?: string
  origem?: string
  destino?: string
  cep_origem?: string
  cep_destino?: string
  peso_kg?: number
  valor_frete?: number
  status: string
  data_coleta?: string
  data_prevista?: string
  data_entrega?: string
  observacoes?: string
}

const STATUS_FRETE: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: 'bg-gray-100 text-gray-700' },
  cotado: { label: 'Cotado', cor: 'bg-blue-100 text-blue-700' },
  contratado: { label: 'Contratado', cor: 'bg-indigo-100 text-indigo-700' },
  coletado: { label: 'Coletado', cor: 'bg-yellow-100 text-yellow-700' },
  em_transito: { label: 'Em Trânsito', cor: 'bg-orange-100 text-orange-700' },
  entregue: { label: 'Entregue', cor: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', cor: 'bg-red-100 text-red-700' },
}

export default function LogisticaSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([])
  const [fretes, setFretes] = useState<Frete[]>([])
  const [loading, setLoading] = useState(true)
  const [showFormTransp, setShowFormTransp] = useState(false)
  const [showFormFrete, setShowFormFrete] = useState(false)
  const [editTransp, setEditTransp] = useState<Transportadora | null>(null)
  const [editFrete, setEditFrete] = useState<Frete | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [t, f] = await Promise.all([
        supabase.from('transportadoras').select('*').order('nome'),
        supabase.from('fretes').select('*').order('created_at', { ascending: false })
      ])
      // Tabelas podem ainda não existir no Supabase (migrations pendentes).
      // Em vez de logar erro 404, apenas usamos lista vazia.
      if (t.error) {
        if (t.error.code !== '42P01' && !/not found|does not exist/i.test(t.error.message || '')) {
          console.warn('transportadoras:', t.error.message)
        }
        setTransportadoras([])
      } else if (t.data) {
        setTransportadoras(t.data)
      }
      if (f.error) {
        if (f.error.code !== '42P01' && !/not found|does not exist/i.test(f.error.message || '')) {
          console.warn('fretes:', f.error.message)
        }
        setFretes([])
      } else if (f.data) {
        setFretes(f.data)
      }
    } catch (err) {
      console.error('Erro ao carregar logística:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const fretesPendentes = fretes.filter(f => ['pendente', 'cotado', 'contratado'].includes(f.status)).length
  const fretesEmTransito = fretes.filter(f => ['coletado', 'em_transito'].includes(f.status)).length
  const fretesEntregues = fretes.filter(f => f.status === 'entregue').length
  const valorTotal = fretes.reduce((s, f) => s + (f.valor_frete || 0), 0)

  const menu = [
    { id: 'dashboard', label: 'Dashboard', icone: '📊' },
    { id: 'pedidos-omie', label: 'Pedidos & NFe', icone: '📦' },
    { id: 'fretes', label: 'Fretes', icone: '🚚', badge: fretesPendentes },
    { id: 'transportadoras', label: 'Transportadoras', icone: '🏢' },
    { id: 'rastreamento', label: 'Rastreamento', icone: '📍' },
    { id: 'sync-omie', label: 'Sync Omie', icone: '⚡' },
  ]

  return (
    <ErpLayout
      titulo="Logística & Frete"
      subtitulo="Gestão de entregas"
      icone="🚚"
      cor="from-orange-500 to-red-600"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      <div className="p-6">
        {activeMenu === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard de Logística</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <KpiCard titulo="Fretes Pendentes" valor={fretesPendentes} icone="⏳" cor="from-yellow-400 to-orange-500" />
              <KpiCard titulo="Em Trânsito" valor={fretesEmTransito} icone="🚛" cor="from-blue-400 to-indigo-500" />
              <KpiCard titulo="Entregues" valor={fretesEntregues} icone="✅" cor="from-green-400 to-emerald-500" />
              <KpiCard titulo="Valor Total" valor={`R$ ${valorTotal.toFixed(2)}`} icone="💰" cor="from-purple-400 to-pink-500" />
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">Fretes Recentes</h3>
              {loading ? <p className="text-gray-500">Carregando...</p> : (
                <div className="space-y-2">
                  {fretes.slice(0, 5).map(f => (
                    <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{f.origem || 'N/A'} → {f.destino || 'N/A'}</p>
                        <p className="text-xs text-gray-500">{f.codigo_rastreio || 'sem rastreio'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_FRETE[f.status]?.cor}`}>
                        {STATUS_FRETE[f.status]?.label || f.status}
                      </span>
                    </div>
                  ))}
                  {fretes.length === 0 && <p className="text-gray-500 text-sm">Nenhum frete cadastrado ainda</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {activeMenu === 'fretes' && (
          <FretesView
            fretes={fretes}
            transportadoras={transportadoras}
            loading={loading}
            onAdd={() => { setEditFrete(null); setShowFormFrete(true) }}
            onEdit={(f) => { setEditFrete(f); setShowFormFrete(true) }}
            onRefresh={fetchAll}
          />
        )}

        {activeMenu === 'transportadoras' && (
          <TransportadorasView
            transportadoras={transportadoras}
            loading={loading}
            onAdd={() => { setEditTransp(null); setShowFormTransp(true) }}
            onEdit={(t) => { setEditTransp(t); setShowFormTransp(true) }}
            onRefresh={fetchAll}
          />
        )}

        {activeMenu === 'rastreamento' && (
          <RastreamentoView fretes={fretes} />
        )}

        {activeMenu === 'pedidos-omie' && (
          <PedidosOmieView />
        )}

        {activeMenu === 'sync-omie' && (
          <SyncOmieView />
        )}
      </div>

      {showFormTransp && (
        <TransportadoraFormModal
          transportadora={editTransp}
          onClose={() => setShowFormTransp(false)}
          onSaved={() => { setShowFormTransp(false); fetchAll() }}
        />
      )}

      {showFormFrete && (
        <FreteFormModal
          frete={editFrete}
          transportadoras={transportadoras}
          onClose={() => setShowFormFrete(false)}
          onSaved={() => { setShowFormFrete(false); fetchAll() }}
        />
      )}
    </ErpLayout>
  )
}

function KpiCard({ titulo, valor, icone, cor }: { titulo: string; valor: any; icone: string; cor: string }) {
  return (
    <div className={`bg-gradient-to-br ${cor} text-white rounded-xl p-5 shadow-md`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-3xl">{icone}</span>
      </div>
      <p className="text-sm opacity-90">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
    </div>
  )
}

function FretesView({ fretes, transportadoras, loading, onAdd, onEdit, onRefresh }: any) {
  const handleDelete = async (id: number) => {
    if (!confirm('Excluir frete?')) return
    await supabase.from('fretes').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Fretes</h2>
        <button onClick={onAdd} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">
          + Novo Frete
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rastreio</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origem → Destino</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transportadora</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Carregando...</td></tr>
            )}
            {!loading && fretes.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum frete cadastrado</td></tr>
            )}
            {fretes.map((f: Frete) => {
              const transp = transportadoras.find((t: Transportadora) => t.id === f.transportadora_id)
              return (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{f.codigo_rastreio || '—'}</td>
                  <td className="px-4 py-3 text-sm">{f.origem || '—'} → {f.destino || '—'}</td>
                  <td className="px-4 py-3 text-sm">{transp?.nome || '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium">R$ {(f.valor_frete || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_FRETE[f.status]?.cor}`}>
                      {STATUS_FRETE[f.status]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onEdit(f)} className="text-indigo-600 hover:text-indigo-700 mr-3 text-sm">Editar</button>
                    <button onClick={() => handleDelete(f.id)} className="text-red-600 hover:text-red-700 text-sm">Excluir</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TransportadorasView({ transportadoras, loading, onAdd, onEdit, onRefresh }: any) {
  const handleDelete = async (id: number) => {
    if (!confirm('Excluir transportadora?')) return
    await supabase.from('transportadoras').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Transportadoras</h2>
        <div className="flex gap-2">
          <OmieSyncButton
            onSync={syncTransportadorasOmie}
            label="Importar do Omie"
            onComplete={onRefresh}
          />
          <button onClick={onAdd} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">
            + Nova Transportadora
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <p className="text-gray-500">Carregando...</p>}
        {!loading && transportadoras.length === 0 && (
          <p className="text-gray-500 col-span-3">Nenhuma transportadora cadastrada</p>
        )}
        {transportadoras.map((t: Transportadora) => (
          <div key={t.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-900">{t.nome}</h3>
                {t.cnpj && <p className="text-xs text-gray-500">CNPJ: {t.cnpj}</p>}
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${t.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                {t.ativo ? 'Ativa' : 'Inativa'}
              </span>
            </div>
            {t.contato && <p className="text-sm text-gray-700">👤 {t.contato}</p>}
            {t.telefone && <p className="text-sm text-gray-700">📞 {t.telefone}</p>}
            {t.email && <p className="text-sm text-gray-700">✉️ {t.email}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => onEdit(t)} className="flex-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-sm font-medium">Editar</button>
              <button onClick={() => handleDelete(t.id)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-sm font-medium">Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RastreamentoView({ fretes }: { fretes: Frete[] }) {
  const [busca, setBusca] = useState('')
  const filtrados = fretes.filter(f =>
    f.codigo_rastreio?.toLowerCase().includes(busca.toLowerCase()) ||
    f.destino?.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Rastreamento de Entregas</h2>
      <input
        type="text"
        placeholder="Buscar por código de rastreio ou destino..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg mb-6 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
      />
      <div className="space-y-3">
        {filtrados.map(f => (
          <div key={f.id} className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-medium">{f.codigo_rastreio || 'Sem código'}</p>
                <p className="text-sm text-gray-700 mt-1">{f.origem} → {f.destino}</p>
                {f.data_prevista && <p className="text-xs text-gray-500 mt-1">Previsão: {f.data_prevista}</p>}
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_FRETE[f.status]?.cor}`}>
                {STATUS_FRETE[f.status]?.label}
              </span>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && <p className="text-gray-500">Nenhum frete encontrado</p>}
      </div>
    </div>
  )
}

function TransportadoraFormModal({ transportadora, onClose, onSaved }: any) {
  const [form, setForm] = useState<Partial<Transportadora>>(transportadora || { ativo: true })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (transportadora) {
        await supabase.from('transportadoras').update(form).eq('id', transportadora.id)
      } else {
        await supabase.from('transportadoras').insert(form)
      }
      onSaved()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold">{transportadora ? 'Editar' : 'Nova'} Transportadora</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input label="Nome *" value={form.nome || ''} onChange={(v) => setForm({ ...form, nome: v })} required />
          <Input label="CNPJ" value={form.cnpj || ''} onChange={(v) => setForm({ ...form, cnpj: v })} />
          <Input label="Contato" value={form.contato || ''} onChange={(v) => setForm({ ...form, contato: v })} />
          <Input label="Telefone" value={form.telefone || ''} onChange={(v) => setForm({ ...form, telefone: v })} />
          <Input label="Email" value={form.email || ''} onChange={(v) => setForm({ ...form, email: v })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            <span className="text-sm">Ativa</span>
          </label>
          <div className="flex gap-2 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FreteFormModal({ frete, transportadoras, onClose, onSaved }: any) {
  const [form, setForm] = useState<Partial<Frete>>(frete || { status: 'pendente' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (payload.valor_frete) payload.valor_frete = parseFloat(payload.valor_frete)
      if (payload.peso_kg) payload.peso_kg = parseFloat(payload.peso_kg)
      if (frete) {
        await supabase.from('fretes').update(payload).eq('id', frete.id)
      } else {
        await supabase.from('fretes').insert(payload)
      }
      onSaved()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold">{frete ? 'Editar' : 'Novo'} Frete</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Código de Rastreio" value={form.codigo_rastreio || ''} onChange={(v) => setForm({ ...form, codigo_rastreio: v })} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transportadora</label>
              <select
                value={form.transportadora_id || ''}
                onChange={(e) => setForm({ ...form, transportadora_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Selecione...</option>
                {transportadoras.map((t: Transportadora) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <Input label="Origem" value={form.origem || ''} onChange={(v) => setForm({ ...form, origem: v })} />
            <Input label="Destino" value={form.destino || ''} onChange={(v) => setForm({ ...form, destino: v })} />
            <Input label="CEP Origem" value={form.cep_origem || ''} onChange={(v) => setForm({ ...form, cep_origem: v })} />
            <Input label="CEP Destino" value={form.cep_destino || ''} onChange={(v) => setForm({ ...form, cep_destino: v })} />
            <Input label="Peso (kg)" type="number" value={String(form.peso_kg || '')} onChange={(v) => setForm({ ...form, peso_kg: v as any })} />
            <Input label="Valor (R$)" type="number" value={String(form.valor_frete || '')} onChange={(v) => setForm({ ...form, valor_frete: v as any })} />
            <Input label="Data Coleta" type="date" value={form.data_coleta || ''} onChange={(v) => setForm({ ...form, data_coleta: v })} />
            <Input label="Data Prevista" type="date" value={form.data_prevista || ''} onChange={(v) => setForm({ ...form, data_prevista: v })} />
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                {Object.entries(STATUS_FRETE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <textarea value={form.observacoes || ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={3} />
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', required = false }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
      />
    </div>
  )
}
