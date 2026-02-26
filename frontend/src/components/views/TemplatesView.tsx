import React from 'react'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import type { Template } from '../../types'

const TemplatesView: React.FC<{ templates: Template[], onAdd: (t: Omit<Template, 'id'>) => void, onDelete: (id: number) => void }> = ({ templates, onAdd, onDelete }) => {
  const [showModal, setShowModal] = React.useState(false)
  const [filterCanal, setFilterCanal] = React.useState<string>('')
  const [filterEtapa, setFilterEtapa] = React.useState<string>('')
  const [newNome, setNewNome] = React.useState('')
  const [newCanal, setNewCanal] = React.useState<'email' | 'whatsapp'>('email')
  const [newEtapa, setNewEtapa] = React.useState('prospecção')
  const [newAssunto, setNewAssunto] = React.useState('')
  const [newCorpo, setNewCorpo] = React.useState('')
  const [previewId, setPreviewId] = React.useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null)

  const filtered = templates.filter(t => {
    return (!filterCanal || t.canal === filterCanal) && (!filterEtapa || t.etapa === filterEtapa)
  })

  const handleAdd = () => {
    if (!newNome.trim() || !newCorpo.trim()) return
    onAdd({ nome: newNome.trim(), canal: newCanal, etapa: newEtapa, assunto: newAssunto.trim() || undefined, corpo: newCorpo.trim() })
    setNewNome(''); setNewAssunto(''); setNewCorpo(''); setShowModal(false)
  }

  const previewTemplate = templates.find(t => t.id === previewId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Templates de Mensagens</h1>
          <p className="mt-1 text-sm text-gray-600">Modelos prontos de email e WhatsApp para cada etapa do funil</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center self-start">
          <PlusIcon className="h-4 w-4 mr-2" /> Novo Template
        </button>
      </div>

      <div className="flex gap-3">
        <select value={filterCanal} onChange={(e) => setFilterCanal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todos os canais</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todas as etapas</option>
          <option value="prospecção">Prospecção</option>
          <option value="amostra">Amostra</option>
          <option value="homologado">Homologado</option>
          <option value="negociacao">Negociação</option>
          <option value="pos_venda">Pós-Venda</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => (
          <div key={t.id} className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-5 hover:shadow-apple transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${t.canal === 'email' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {t.canal === 'email' ? '📧 Email' : '💬 WhatsApp'}
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                  {t.etapa}
                </span>
              </div>
              <button onClick={() => setDeleteConfirmId(t.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{t.nome}</h3>
            {t.assunto && <p className="text-xs text-gray-500 mb-2">Assunto: {t.assunto}</p>}
            <p className="text-sm text-gray-600 line-clamp-3 whitespace-pre-line">{t.corpo.slice(0, 120)}...</p>
            <button onClick={() => setPreviewId(t.id)} className="mt-3 text-xs text-primary-600 hover:text-primary-800 font-medium">Ver completo →</button>
          </div>
        ))}
      </div>

      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Excluir Template</h3>
              <p className="text-sm text-gray-600 mt-2">Tem certeza que deseja excluir <strong>{templates.find(t => t.id === deleteConfirmId)?.nome}</strong>?</p>
              <p className="text-xs text-gray-400 mt-1">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-apple font-medium transition-colors">Cancelar</button>
              <button onClick={() => { onDelete(deleteConfirmId); setDeleteConfirmId(null) }} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-apple font-medium transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{previewTemplate.nome}</h2>
                <div className="flex gap-2 mt-1">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${previewTemplate.canal === 'email' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {previewTemplate.canal === 'email' ? '📧 Email' : '💬 WhatsApp'}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{previewTemplate.etapa}</span>
                </div>
              </div>
              <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            {previewTemplate.assunto && (
              <div className="mb-3 p-3 bg-gray-50 rounded-apple border border-gray-200">
                <p className="text-xs text-gray-500">Assunto</p>
                <p className="text-sm font-medium text-gray-900">{previewTemplate.assunto}</p>
              </div>
            )}
            <div className="p-4 bg-gray-50 rounded-apple border border-gray-200 whitespace-pre-line text-sm text-gray-800">
              {previewTemplate.corpo}
            </div>
            <p className="text-xs text-gray-500 mt-3">Variáveis: {'{nome}'}, {'{empresa}'}, {'{vendedor}'}</p>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-lg w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Novo Template</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Ex: Follow-up Pós-Reunião" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
                  <select value={newCanal} onChange={(e) => setNewCanal(e.target.value as 'email' | 'whatsapp')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
                  <select value={newEtapa} onChange={(e) => setNewEtapa(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="prospecção">Prospecção</option>
                    <option value="amostra">Amostra</option>
                    <option value="homologado">Homologado</option>
                    <option value="negociacao">Negociação</option>
                    <option value="pos_venda">Pós-Venda</option>
                  </select>
                </div>
              </div>
              {newCanal === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
                  <input value={newAssunto} onChange={(e) => setNewAssunto(e.target.value)} placeholder="Assunto do email" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Corpo da mensagem *</label>
                <textarea value={newCorpo} onChange={(e) => setNewCorpo(e.target.value)} rows={6} placeholder="Use {nome}, {empresa}, {vendedor} como variáveis..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAdd} disabled={!newNome.trim() || !newCorpo.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">Criar Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TemplatesView
