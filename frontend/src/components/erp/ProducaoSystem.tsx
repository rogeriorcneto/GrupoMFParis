import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'

interface OrdemProducao {
  id: number
  numero: string
  produto_id?: number
  pedido_id?: number
  quantidade: number
  data_inicio?: string
  data_prevista?: string
  data_conclusao?: string
  status: string
  prioridade: string
  responsavel?: string
  observacoes?: string
}

const STATUS_OP: Record<string, { label: string; cor: string }> = {
  aberta: { label: 'Aberta', cor: 'bg-gray-100 text-gray-700' },
  em_producao: { label: 'Em Produção', cor: 'bg-blue-100 text-blue-700' },
  pausada: { label: 'Pausada', cor: 'bg-yellow-100 text-yellow-700' },
  concluida: { label: 'Concluída', cor: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', cor: 'bg-red-100 text-red-700' },
}

const PRIORIDADES: Record<string, { label: string; cor: string }> = {
  baixa: { label: 'Baixa', cor: 'text-gray-500' },
  normal: { label: 'Normal', cor: 'text-blue-500' },
  alta: { label: 'Alta', cor: 'text-orange-500' },
  urgente: { label: 'Urgente', cor: 'text-red-500' },
}

export default function ProducaoSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [ordens, setOrdens] = useState<OrdemProducao[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editOp, setEditOp] = useState<OrdemProducao | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('ordens_producao').select('*').order('created_at', { ascending: false })
      if (data) setOrdens(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const abertas = ordens.filter(o => o.status === 'aberta').length
  const emProducao = ordens.filter(o => o.status === 'em_producao').length
  const concluidas = ordens.filter(o => o.status === 'concluida').length

  const menu = [
    { id: 'dashboard', label: 'Dashboard', icone: '📊' },
    { id: 'ordens', label: 'Ordens de Produção', icone: '🏭', badge: abertas + emProducao },
    { id: 'kanban', label: 'Kanban', icone: '📋' },
  ]

  return (
    <ErpLayout
      titulo="Produção"
      subtitulo="Ordens de produção"
      icone="🏭"
      cor="from-gray-600 to-gray-800"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      <div className="p-6">
        {activeMenu === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Dashboard de Produção</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <KpiP titulo="Abertas" valor={abertas} cor="from-gray-400 to-gray-600" icone="📂" />
              <KpiP titulo="Em Produção" valor={emProducao} cor="from-blue-400 to-blue-600" icone="⚙️" />
              <KpiP titulo="Concluídas" valor={concluidas} cor="from-green-400 to-green-600" icone="✅" />
              <KpiP titulo="Total" valor={ordens.length} cor="from-purple-400 to-purple-600" icone="🏭" />
            </div>
          </div>
        )}

        {activeMenu === 'ordens' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Ordens de Produção</h2>
              <button onClick={() => { setEditOp(null); setShowForm(true) }} className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-medium">
                + Nova OP
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantidade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prevista</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading && <tr><td colSpan={6} className="text-center py-8">Carregando...</td></tr>}
                  {!loading && ordens.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhuma OP cadastrada</td></tr>}
                  {ordens.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-bold">{o.numero}</td>
                      <td className="px-4 py-3 text-sm">{o.quantidade}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`font-medium ${PRIORIDADES[o.prioridade]?.cor}`}>● {PRIORIDADES[o.prioridade]?.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">{o.data_prevista || '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${STATUS_OP[o.status]?.cor}`}>{STATUS_OP[o.status]?.label}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditOp(o); setShowForm(true) }} className="text-indigo-600 mr-3 text-sm">Editar</button>
                        <button onClick={async () => {
                          if (confirm('Excluir?')) { await supabase.from('ordens_producao').delete().eq('id', o.id); fetchAll() }
                        }} className="text-red-600 text-sm">Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeMenu === 'kanban' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Kanban de Produção</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {['aberta', 'em_producao', 'pausada', 'concluida'].map(status => (
                <div key={status} className="bg-gray-100 rounded-xl p-3">
                  <h3 className="font-bold mb-3 text-sm">{STATUS_OP[status].label}</h3>
                  <div className="space-y-2">
                    {ordens.filter(o => o.status === status).map(o => (
                      <div key={o.id} className="bg-white rounded-lg p-3 shadow-sm">
                        <p className="font-mono text-xs text-gray-500">{o.numero}</p>
                        <p className="text-sm font-medium mt-1">Qtd: {o.quantidade}</p>
                        <p className={`text-xs mt-1 ${PRIORIDADES[o.prioridade]?.cor}`}>● {PRIORIDADES[o.prioridade]?.label}</p>
                      </div>
                    ))}
                    {ordens.filter(o => o.status === status).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Vazio</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <OpFormModal
          op={editOp}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchAll() }}
        />
      )}
    </ErpLayout>
  )
}

function KpiP({ titulo, valor, cor, icone }: any) {
  return (
    <div className={`bg-gradient-to-br ${cor} text-white rounded-xl p-5 shadow-md`}>
      <span className="text-3xl">{icone}</span>
      <p className="text-sm opacity-90 mt-2">{titulo}</p>
      <p className="text-3xl font-bold">{valor}</p>
    </div>
  )
}

function OpFormModal({ op, onClose, onSaved }: any) {
  const [form, setForm] = useState<Partial<OrdemProducao>>(
    op || { status: 'aberta', prioridade: 'normal', numero: 'OP-' + Date.now(), quantidade: 1 }
  )
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: any = { ...form }
      payload.quantidade = parseFloat(payload.quantidade)
      if (op) await supabase.from('ordens_producao').update(payload).eq('id', op.id)
      else await supabase.from('ordens_producao').insert(payload)
      onSaved()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h3 className="text-lg font-bold">{op ? 'Editar' : 'Nova'} Ordem de Produção</h3>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Número" value={form.numero || ''} onChange={(e) => setForm({ ...form, numero: e.target.value })} required />
        <input type="number" step="0.001" className="w-full px-3 py-2 border rounded-lg" placeholder="Quantidade" value={form.quantidade || ''} onChange={(e) => setForm({ ...form, quantidade: e.target.value as any })} required />
        <input type="date" className="w-full px-3 py-2 border rounded-lg" placeholder="Data prevista" value={form.data_prevista || ''} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })} />
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Responsável" value={form.responsavel || ''} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
        <select className="w-full px-3 py-2 border rounded-lg" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
          {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="w-full px-3 py-2 border rounded-lg" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {Object.entries(STATUS_OP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <textarea className="w-full px-3 py-2 border rounded-lg" placeholder="Observações" value={form.observacoes || ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg">{saving ? '...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
