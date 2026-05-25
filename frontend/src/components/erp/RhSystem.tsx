import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'
import OmieSyncButton from './OmieSyncButton'
import { syncFuncionariosOmie } from '../../lib/omieSync'

interface Funcionario {
  id: number
  nome: string
  cpf?: string
  email?: string
  telefone?: string
  cargo?: string
  departamento?: string
  data_admissao?: string
  salario?: number
  status: string
}

const STATUS_F: Record<string, { label: string; cor: string }> = {
  ativo: { label: 'Ativo', cor: 'bg-green-100 text-green-700' },
  ferias: { label: 'Férias', cor: 'bg-blue-100 text-blue-700' },
  afastado: { label: 'Afastado', cor: 'bg-yellow-100 text-yellow-700' },
  demitido: { label: 'Demitido', cor: 'bg-red-100 text-red-700' },
}

export default function RhSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editF, setEditF] = useState<Funcionario | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase.from('funcionarios').select('*').order('nome')
    if (data) setFuncionarios(data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const ativos = funcionarios.filter(f => f.status === 'ativo').length
  const folhaTotal = funcionarios.filter(f => f.status === 'ativo').reduce((s, f) => s + Number(f.salario || 0), 0)
  const departamentos = Array.from(new Set(funcionarios.map(f => f.departamento).filter(Boolean)))

  const menu = [
    { id: 'dashboard', label: 'Dashboard', icone: '📊' },
    { id: 'funcionarios', label: 'Funcionários', icone: '👥', badge: ativos },
    { id: 'folha', label: 'Folha de Pagamento', icone: '💵' },
    { id: 'ponto', label: 'Ponto Eletrônico', icone: '⏰' },
  ]

  return (
    <ErpLayout
      titulo="Recursos Humanos"
      subtitulo="Gestão de pessoas"
      icone="👥"
      cor="from-indigo-500 to-blue-600"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      <div className="p-6">
        {activeMenu === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Dashboard de RH</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <KpiRh titulo="Funcionários Ativos" valor={ativos} icone="✅" cor="from-green-400 to-emerald-600" />
              <KpiRh titulo="Total Cadastrado" valor={funcionarios.length} icone="👥" cor="from-blue-400 to-indigo-600" />
              <KpiRh titulo="Departamentos" valor={departamentos.length} icone="🏢" cor="from-purple-400 to-purple-600" />
              <KpiRh titulo="Folha Mensal" valor={`R$ ${folhaTotal.toFixed(0)}`} icone="💵" cor="from-orange-400 to-red-600" />
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-bold mb-4">Por Departamento</h3>
              <div className="space-y-2">
                {departamentos.map(dep => {
                  const count = funcionarios.filter(f => f.departamento === dep).length
                  return (
                    <div key={dep} className="flex justify-between p-3 bg-gray-50 rounded-lg">
                      <span>{dep}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                  )
                })}
                {departamentos.length === 0 && <p className="text-gray-500 text-sm">Sem departamentos cadastrados</p>}
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'funcionarios' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Funcionários</h2>
              <div className="flex gap-2">
                <OmieSyncButton
                  onSync={syncFuncionariosOmie}
                  label="Importar do Omie"
                  onComplete={fetchAll}
                />
                <button onClick={() => { setEditF(null); setShowForm(true) }} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium">
                  + Novo Funcionário
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading && <p>Carregando...</p>}
              {!loading && funcionarios.length === 0 && <p className="text-gray-500 col-span-3">Nenhum funcionário</p>}
              {funcionarios.map(f => (
                <div key={f.id} className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                      {f.nome.charAt(0)}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded ${STATUS_F[f.status]?.cor}`}>{STATUS_F[f.status]?.label}</span>
                  </div>
                  <h3 className="font-bold">{f.nome}</h3>
                  <p className="text-sm text-gray-600">{f.cargo || '—'}</p>
                  <p className="text-xs text-gray-500">{f.departamento || '—'}</p>
                  {f.email && <p className="text-xs text-gray-500 mt-2">✉️ {f.email}</p>}
                  {f.telefone && <p className="text-xs text-gray-500">📞 {f.telefone}</p>}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => { setEditF(f); setShowForm(true) }} className="flex-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded text-sm">Editar</button>
                    <button onClick={async () => {
                      if (confirm('Excluir?')) { await supabase.from('funcionarios').delete().eq('id', f.id); fetchAll() }
                    }} className="px-3 py-1 bg-red-50 text-red-700 rounded text-sm">Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeMenu === 'folha' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Folha de Pagamento</h2>
            <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
              <p className="text-sm text-gray-500">Total Mensal Estimado</p>
              <p className="text-4xl font-bold text-indigo-600">R$ {folhaTotal.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Salário</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {funcionarios.filter(f => f.status === 'ativo').map(f => (
                    <tr key={f.id}>
                      <td className="px-4 py-3 font-medium">{f.nome}</td>
                      <td className="px-4 py-3 text-sm">{f.cargo || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold">R$ {Number(f.salario || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeMenu === 'ponto' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">⏰ Ponto Eletrônico</h2>
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <span className="text-6xl">⏰</span>
              <h3 className="text-xl font-bold mt-4">Sistema de Ponto</h3>
              <p className="text-gray-500 mt-2">Registro de entrada/saída em desenvolvimento</p>
              <p className="text-sm text-gray-400 mt-4">A tabela <code className="bg-gray-100 px-2 py-0.5 rounded">registros_ponto</code> já está pronta no banco.</p>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <FuncFormModal func={editF} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchAll() }} />
      )}
    </ErpLayout>
  )
}

function KpiRh({ titulo, valor, icone, cor }: any) {
  return (
    <div className={`bg-gradient-to-br ${cor} text-white rounded-xl p-5 shadow-md`}>
      <span className="text-3xl">{icone}</span>
      <p className="text-sm opacity-90 mt-2">{titulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
    </div>
  )
}

function FuncFormModal({ func, onClose, onSaved }: any) {
  const [form, setForm] = useState<Partial<Funcionario>>(func || { status: 'ativo' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (payload.salario) payload.salario = parseFloat(payload.salario)
      if (func) await supabase.from('funcionarios').update(payload).eq('id', func.id)
      else await supabase.from('funcionarios').insert(payload)
      onSaved()
    } catch (err) {
      console.error(err); alert('Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold">{func ? 'Editar' : 'Novo'} Funcionário</h3>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Nome" value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="CPF" value={form.cpf || ''} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Telefone" value={form.telefone || ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Cargo" value={form.cargo || ''} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Departamento" value={form.departamento || ''} onChange={(e) => setForm({ ...form, departamento: e.target.value })} />
        <input type="date" className="w-full px-3 py-2 border rounded-lg" value={form.data_admissao || ''} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
        <input type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg" placeholder="Salário (R$)" value={form.salario || ''} onChange={(e) => setForm({ ...form, salario: e.target.value as any })} />
        <select className="w-full px-3 py-2 border rounded-lg" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {Object.entries(STATUS_F).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg">{saving ? '...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
