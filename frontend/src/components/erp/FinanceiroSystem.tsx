import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'
import OmieSyncButton from './OmieSyncButton'
import { syncFinanceiroCompleto } from '../../lib/omieSync'

interface Lancamento {
  id: number
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  data_vencimento: string
  data_pagamento?: string
  categoria_id?: number
  conta_bancaria_id?: number
  status: string
  forma_pagamento?: string
  observacoes?: string
}

interface Categoria {
  id: number
  nome: string
  tipo: 'receita' | 'despesa'
  cor?: string
}

interface ContaBancaria {
  id: number
  nome: string
  banco?: string
  agencia?: string
  conta?: string
  tipo?: 'corrente' | 'poupanca' | 'aplicacao' | 'caixa'
  saldo_inicial?: number
  saldo_atual: number
  ativo: boolean
}

const STATUS_FIN: Record<string, { label: string; cor: string }> = {
  pendente: { label: 'Pendente', cor: 'bg-yellow-100 text-yellow-700' },
  pago: { label: 'Pago', cor: 'bg-green-100 text-green-700' },
  atrasado: { label: 'Atrasado', cor: 'bg-red-100 text-red-700' },
  cancelado: { label: 'Cancelado', cor: 'bg-gray-100 text-gray-700' },
}

export default function FinanceiroSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState<'receita' | 'despesa' | null>(null)
  const [editLanc, setEditLanc] = useState<Lancamento | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [l, c, b] = await Promise.all([
        supabase.from('lancamentos_financeiros').select('*').order('data_vencimento', { ascending: false }),
        supabase.from('categorias_financeiras').select('*').order('nome'),
        supabase.from('contas_bancarias').select('*').order('nome'),
      ])
      if (l.data) setLancamentos(l.data)
      if (c.data) setCategorias(c.data)
      if (b.data) setContas(b.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const receitas = lancamentos.filter(l => l.tipo === 'receita')
  const despesas = lancamentos.filter(l => l.tipo === 'despesa')
  const totalReceitas = receitas.reduce((s, l) => s + Number(l.valor), 0)
  const totalDespesas = despesas.reduce((s, l) => s + Number(l.valor), 0)
  const saldo = totalReceitas - totalDespesas
  const aReceber = receitas.filter(l => l.status === 'pendente').reduce((s, l) => s + Number(l.valor), 0)
  const aPagar = despesas.filter(l => l.status === 'pendente').reduce((s, l) => s + Number(l.valor), 0)

  const menu = [
    { id: 'dashboard', label: 'Dashboard', icone: '📊' },
    { id: 'receber', label: 'Contas a Receber', icone: '💰', badge: receitas.filter(l => l.status === 'pendente').length },
    { id: 'pagar', label: 'Contas a Pagar', icone: '💸', badge: despesas.filter(l => l.status === 'pendente').length },
    { id: 'fluxo', label: 'Fluxo de Caixa', icone: '📈' },
    { id: 'contas', label: 'Contas Bancárias', icone: '🏦' },
    { id: 'categorias', label: 'Categorias', icone: '🏷️' },
  ]

  return (
    <ErpLayout
      titulo="Financeiro"
      subtitulo="Gestão financeira"
      icone="💰"
      cor="from-green-500 to-emerald-600"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      <div className="p-6">
        {activeMenu === 'dashboard' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h2>
              <OmieSyncButton
                onSync={syncFinanceiroCompleto}
                label="Importar do Omie"
                onComplete={fetchAll}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <KpiFin titulo="Saldo" valor={saldo} icone="💵" cor={saldo >= 0 ? 'from-green-500 to-emerald-600' : 'from-red-500 to-rose-600'} />
              <KpiFin titulo="Receitas" valor={totalReceitas} icone="📥" cor="from-blue-500 to-indigo-600" />
              <KpiFin titulo="Despesas" valor={totalDespesas} icone="📤" cor="from-orange-500 to-red-600" />
              <KpiFin titulo="A Receber" valor={aReceber} icone="⏳" cor="from-purple-500 to-pink-600" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">📥 Receitas Pendentes</h3>
                {receitas.filter(l => l.status === 'pendente').slice(0, 5).map(l => (
                  <div key={l.id} className="flex justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{l.descricao}</p>
                      <p className="text-xs text-gray-500">Vence: {l.data_vencimento}</p>
                    </div>
                    <span className="text-green-600 font-bold">R$ {Number(l.valor).toFixed(2)}</span>
                  </div>
                ))}
                {receitas.filter(l => l.status === 'pendente').length === 0 && (
                  <p className="text-sm text-gray-500">Nenhuma receita pendente</p>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">📤 Despesas Pendentes</h3>
                {despesas.filter(l => l.status === 'pendente').slice(0, 5).map(l => (
                  <div key={l.id} className="flex justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{l.descricao}</p>
                      <p className="text-xs text-gray-500">Vence: {l.data_vencimento}</p>
                    </div>
                    <span className="text-red-600 font-bold">R$ {Number(l.valor).toFixed(2)}</span>
                  </div>
                ))}
                {despesas.filter(l => l.status === 'pendente').length === 0 && (
                  <p className="text-sm text-gray-500">Nenhuma despesa pendente</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'receber' && (
          <LancamentosTable
            titulo="Contas a Receber"
            tipo="receita"
            lancamentos={receitas}
            categorias={categorias}
            loading={loading}
            onAdd={() => { setEditLanc(null); setShowForm('receita') }}
            onEdit={(l: Lancamento) => { setEditLanc(l); setShowForm('receita') }}
            onRefresh={fetchAll}
          />
        )}

        {activeMenu === 'pagar' && (
          <LancamentosTable
            titulo="Contas a Pagar"
            tipo="despesa"
            lancamentos={despesas}
            categorias={categorias}
            loading={loading}
            onAdd={() => { setEditLanc(null); setShowForm('despesa') }}
            onEdit={(l: Lancamento) => { setEditLanc(l); setShowForm('despesa') }}
            onRefresh={fetchAll}
          />
        )}

        {activeMenu === 'fluxo' && (
          <FluxoCaixa lancamentos={lancamentos} />
        )}

        {activeMenu === 'contas' && (
          <ContasBancariasView contas={contas} loading={loading} onRefresh={fetchAll} />
        )}

        {activeMenu === 'categorias' && (
          <CategoriasView categorias={categorias} loading={loading} onRefresh={fetchAll} />
        )}
      </div>

      {showForm && (
        <LancamentoFormModal
          lancamento={editLanc}
          tipo={showForm}
          categorias={categorias}
          contas={contas}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); fetchAll() }}
        />
      )}
    </ErpLayout>
  )
}

function KpiFin({ titulo, valor, icone, cor }: any) {
  return (
    <div className={`bg-gradient-to-br ${cor} text-white rounded-xl p-5 shadow-md`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-3xl">{icone}</span>
      </div>
      <p className="text-sm opacity-90">{titulo}</p>
      <p className="text-2xl font-bold mt-1">R$ {Number(valor).toFixed(2)}</p>
    </div>
  )
}

function LancamentosTable({ titulo, tipo, lancamentos, categorias, loading, onAdd, onEdit, onRefresh }: any) {
  const handleDelete = async (id: number) => {
    if (!confirm('Excluir lançamento?')) return
    await supabase.from('lancamentos_financeiros').delete().eq('id', id)
    onRefresh()
  }

  const handleMarcarPago = async (l: Lancamento) => {
    await supabase.from('lancamentos_financeiros').update({
      status: 'pago',
      data_pagamento: new Date().toISOString().slice(0, 10)
    }).eq('id', l.id)
    onRefresh()
  }

  const corBotao = tipo === 'receita' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{titulo}</h2>
        <button onClick={onAdd} className={`px-4 py-2 ${corBotao} text-white rounded-lg font-medium`}>
          + Novo Lançamento
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimento</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={6} className="text-center py-8 text-gray-500">Carregando...</td></tr>}
            {!loading && lancamentos.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum lançamento</td></tr>
            )}
            {lancamentos.map((l: Lancamento) => {
              const cat = categorias.find((c: Categoria) => c.id === l.categoria_id)
              return (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm">{l.descricao}</p>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {cat && <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: cat.cor + '20', color: cat.cor }}>{cat.nome}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">{l.data_vencimento}</td>
                  <td className="px-4 py-3 text-right font-bold text-sm">R$ {Number(l.valor).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_FIN[l.status]?.cor}`}>{STATUS_FIN[l.status]?.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {l.status === 'pendente' && (
                      <button onClick={() => handleMarcarPago(l)} className="text-green-600 hover:text-green-700 mr-3 text-sm">✓ Pagar</button>
                    )}
                    <button onClick={() => onEdit(l)} className="text-indigo-600 hover:text-indigo-700 mr-3 text-sm">Editar</button>
                    <button onClick={() => handleDelete(l.id)} className="text-red-600 hover:text-red-700 text-sm">Excluir</button>
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

function FluxoCaixa({ lancamentos }: { lancamentos: Lancamento[] }) {
  // Agrupar por mês
  const porMes: Record<string, { receitas: number; despesas: number }> = {}
  lancamentos.forEach(l => {
    const mes = l.data_vencimento.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = { receitas: 0, despesas: 0 }
    if (l.tipo === 'receita') porMes[mes].receitas += Number(l.valor)
    else porMes[mes].despesas += Number(l.valor)
  })

  const meses = Object.keys(porMes).sort().reverse()
  const maxValor = Math.max(...Object.values(porMes).flatMap(m => [m.receitas, m.despesas]), 1)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Fluxo de Caixa</h2>
      <div className="bg-white rounded-xl shadow-sm p-6">
        {meses.length === 0 && <p className="text-gray-500">Sem dados ainda</p>}
        <div className="space-y-4">
          {meses.map(mes => {
            const dados = porMes[mes]
            const saldo = dados.receitas - dados.despesas
            return (
              <div key={mes} className="border-b pb-4 last:border-0">
                <div className="flex justify-between mb-2">
                  <p className="font-bold text-gray-900">{mes}</p>
                  <p className={`font-bold ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Saldo: R$ {saldo.toFixed(2)}
                  </p>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-green-700">Receitas</span>
                      <span>R$ {dados.receitas.toFixed(2)}</span>
                    </div>
                    <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full" style={{ width: `${(dados.receitas / maxValor) * 100}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-red-700">Despesas</span>
                      <span>R$ {dados.despesas.toFixed(2)}</span>
                    </div>
                    <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full" style={{ width: `${(dados.despesas / maxValor) * 100}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ContasBancariasView({ contas, loading, onRefresh }: any) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<ContaBancaria>>({ tipo: 'corrente' as any, ativo: true })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: any = { ...form }
    if (payload.saldo_inicial) {
      payload.saldo_inicial = parseFloat(payload.saldo_inicial)
      payload.saldo_atual = payload.saldo_inicial
    }
    await supabase.from('contas_bancarias').insert(payload)
    setShowForm(false)
    setForm({ tipo: 'corrente' as any, ativo: true })
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Contas Bancárias</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium">+ Nova Conta</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading && <p>Carregando...</p>}
        {contas.map((c: ContaBancaria) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold">{c.nome}</h3>
                {c.banco && <p className="text-xs text-gray-500">{c.banco}</p>}
              </div>
              <span className="text-2xl">🏦</span>
            </div>
            <p className="text-sm text-gray-500">Saldo Atual</p>
            <p className="text-2xl font-bold text-green-600">R$ {Number(c.saldo_atual).toFixed(2)}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold">Nova Conta Bancária</h3>
            <input className="w-full px-3 py-2 border rounded-lg" placeholder="Nome" value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            <input className="w-full px-3 py-2 border rounded-lg" placeholder="Banco" value={form.banco || ''} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg" type="number" placeholder="Saldo Inicial" value={form.saldo_inicial || ''} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value as any })} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function CategoriasView({ categorias, loading, onRefresh }: any) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Categoria>>({ tipo: 'receita', cor: '#6366f1' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('categorias_financeiras').insert(form)
    setShowForm(false)
    setForm({ tipo: 'receita', cor: '#6366f1' })
    onRefresh()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir categoria?')) return
    await supabase.from('categorias_financeiras').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Categorias</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium">+ Nova</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold text-green-700 mb-3">📥 Receitas</h3>
          <div className="space-y-2">
            {categorias.filter((c: Categoria) => c.tipo === 'receita').map((c: Categoria) => (
              <div key={c.id} className="bg-white rounded-lg shadow-sm p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: c.cor }}></div>
                  <span>{c.nome}</span>
                </div>
                <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-sm">Excluir</button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-bold text-red-700 mb-3">📤 Despesas</h3>
          <div className="space-y-2">
            {categorias.filter((c: Categoria) => c.tipo === 'despesa').map((c: Categoria) => (
              <div key={c.id} className="bg-white rounded-lg shadow-sm p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: c.cor }}></div>
                  <span>{c.nome}</span>
                </div>
                <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-sm">Excluir</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold">Nova Categoria</h3>
            <input className="w-full px-3 py-2 border rounded-lg" placeholder="Nome" value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            <select className="w-full px-3 py-2 border rounded-lg" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
            <input type="color" className="w-full h-10 border rounded-lg" value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function LancamentoFormModal({ lancamento, tipo, categorias, contas, onClose, onSaved }: any) {
  const [form, setForm] = useState<Partial<Lancamento>>(
    lancamento || {
      tipo,
      status: 'pendente',
      data_vencimento: new Date().toISOString().slice(0, 10)
    }
  )
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: any = { ...form, tipo }
      if (payload.valor) payload.valor = parseFloat(payload.valor)
      if (lancamento) {
        await supabase.from('lancamentos_financeiros').update(payload).eq('id', lancamento.id)
      } else {
        await supabase.from('lancamentos_financeiros').insert(payload)
      }
      onSaved()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const cor = tipo === 'receita' ? 'green' : 'red'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold">
          {lancamento ? 'Editar' : 'Novo'} {tipo === 'receita' ? 'Recebimento' : 'Pagamento'}
        </h3>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Descrição" value={form.descricao || ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required />
        <input type="number" step="0.01" className="w-full px-3 py-2 border rounded-lg" placeholder="Valor (R$)" value={form.valor || ''} onChange={(e) => setForm({ ...form, valor: e.target.value as any })} required />
        <input type="date" className="w-full px-3 py-2 border rounded-lg" value={form.data_vencimento || ''} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} required />
        <select className="w-full px-3 py-2 border rounded-lg" value={form.categoria_id || ''} onChange={(e) => setForm({ ...form, categoria_id: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Selecione categoria...</option>
          {categorias.filter((c: Categoria) => c.tipo === tipo).map((c: Categoria) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <select className="w-full px-3 py-2 border rounded-lg" value={form.conta_bancaria_id || ''} onChange={(e) => setForm({ ...form, conta_bancaria_id: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Selecione conta...</option>
          {contas.map((c: ContaBancaria) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <select className="w-full px-3 py-2 border rounded-lg" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {Object.entries(STATUS_FIN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <textarea className="w-full px-3 py-2 border rounded-lg" placeholder="Observações" value={form.observacoes || ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className={`flex-1 px-4 py-2 bg-${cor}-500 hover:bg-${cor}-600 text-white rounded-lg disabled:opacity-50`}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
