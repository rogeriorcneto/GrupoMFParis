import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'

interface Documento {
  id: number
  titulo: string
  descricao?: string
  categoria_id?: number
  arquivo_url?: string
  arquivo_nome?: string
  tags?: string[]
  validade?: string
  status: string
  created_at: string
}

interface CategoriaDoc {
  id: number
  nome: string
  cor?: string
  icone?: string
}

export default function DocumentosSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('todos')
  const [docs, setDocs] = useState<Documento[]>([])
  const [categorias, setCategorias] = useState<CategoriaDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editDoc, setEditDoc] = useState<Documento | null>(null)
  const [busca, setBusca] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    const [d, c] = await Promise.all([
      supabase.from('documentos').select('*').order('created_at', { ascending: false }),
      supabase.from('documentos_categorias').select('*').order('nome')
    ])
    if (d.data) setDocs(d.data)
    if (c.data) setCategorias(c.data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const docsFiltrados = docs.filter(d => {
    const matchBusca = !busca || d.titulo.toLowerCase().includes(busca.toLowerCase()) || d.descricao?.toLowerCase().includes(busca.toLowerCase())
    if (activeMenu === 'todos') return matchBusca
    if (activeMenu === 'expirados') return matchBusca && d.status === 'expirado'
    return matchBusca && String(d.categoria_id) === activeMenu
  })

  const menu = [
    { id: 'todos', label: 'Todos', icone: '📁', badge: docs.length },
    ...categorias.map(c => ({ id: String(c.id), label: c.nome, icone: c.icone || '📄' })),
    { id: 'expirados', label: 'Expirados', icone: '⚠️' },
  ]

  return (
    <ErpLayout
      titulo="Gestão Documental"
      subtitulo="Arquivamento digital"
      icone="📁"
      cor="from-red-500 to-rose-600"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Documentos</h2>
          <button onClick={() => { setEditDoc(null); setShowForm(true) }} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium">
            + Novo Documento
          </button>
        </div>

        <input
          type="text"
          placeholder="🔍 Buscar documentos..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-full max-w-md mb-6 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && <p>Carregando...</p>}
          {!loading && docsFiltrados.length === 0 && <p className="text-gray-500 col-span-3">Nenhum documento encontrado</p>}
          {docsFiltrados.map(d => {
            const cat = categorias.find(c => c.id === d.categoria_id)
            return (
              <div key={d.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <span className="text-4xl">{cat?.icone || '📄'}</span>
                  <div className="flex-1">
                    <h3 className="font-bold">{d.titulo}</h3>
                    {cat && <span className="inline-block px-2 py-0.5 text-xs rounded mt-1" style={{ backgroundColor: (cat.cor || '#6366f1') + '20', color: cat.cor || '#6366f1' }}>{cat.nome}</span>}
                    {d.descricao && <p className="text-sm text-gray-600 mt-2">{d.descricao}</p>}
                    {d.tags && d.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {d.tags.map(t => <span key={t} className="px-2 py-0.5 bg-gray-100 text-xs rounded">#{t}</span>)}
                      </div>
                    )}
                    {d.validade && (
                      <p className="text-xs text-gray-500 mt-2">📅 Validade: {d.validade}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  {d.arquivo_url && (
                    <a href={d.arquivo_url} target="_blank" rel="noreferrer" className="flex-1 text-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded text-sm font-medium">📥 Abrir</a>
                  )}
                  <button onClick={() => { setEditDoc(d); setShowForm(true) }} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded text-sm">Editar</button>
                  <button onClick={async () => {
                    if (confirm('Excluir?')) { await supabase.from('documentos').delete().eq('id', d.id); fetchAll() }
                  }} className="px-3 py-1.5 bg-red-50 text-red-700 rounded text-sm">Excluir</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <DocFormModal doc={editDoc} categorias={categorias} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchAll() }} />
      )}
    </ErpLayout>
  )
}

function DocFormModal({ doc, categorias, onClose, onSaved }: any) {
  const [form, setForm] = useState<Partial<Documento>>(doc || { status: 'ativo', tags: [] })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (doc) await supabase.from('documentos').update(payload).eq('id', doc.id)
      else await supabase.from('documentos').insert(payload)
      onSaved()
    } catch (err) {
      console.error(err); alert('Erro')
    } finally { setSaving(false) }
  }

  const addTag = () => {
    if (tagInput.trim()) {
      setForm({ ...form, tags: [...(form.tags || []), tagInput.trim()] })
      setTagInput('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold">{doc ? 'Editar' : 'Novo'} Documento</h3>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="Título" value={form.titulo || ''} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
        <textarea className="w-full px-3 py-2 border rounded-lg" placeholder="Descrição" value={form.descricao || ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={3} />
        <select className="w-full px-3 py-2 border rounded-lg" value={form.categoria_id || ''} onChange={(e) => setForm({ ...form, categoria_id: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Selecione categoria...</option>
          {categorias.map((c: CategoriaDoc) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
        </select>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="URL do arquivo (opcional)" value={form.arquivo_url || ''} onChange={(e) => setForm({ ...form, arquivo_url: e.target.value })} />
        <input type="date" className="w-full px-3 py-2 border rounded-lg" placeholder="Validade" value={form.validade || ''} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
        <div>
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 border rounded-lg" placeholder="Adicionar tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
            <button type="button" onClick={addTag} className="px-4 py-2 bg-gray-100 rounded-lg">+</button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {(form.tags || []).map(t => (
              <span key={t} className="px-2 py-0.5 bg-gray-100 text-xs rounded">
                #{t}
                <button type="button" onClick={() => setForm({ ...form, tags: form.tags?.filter(x => x !== t) })} className="ml-1 text-red-500">×</button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg">{saving ? '...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
