import React from 'react'
import type { Cliente, Vendedor } from '../types'

interface DragItem {
  cliente: Cliente
  fromStage: string
}

interface FunilModalsProps {
  // Motivo Perda
  showMotivoPerda: boolean
  setShowMotivoPerda: (v: boolean) => void
  motivoPerdaTexto: string
  setMotivoPerdaTexto: (v: string) => void
  categoriaPerdaSel: NonNullable<Cliente['categoriaPerda']>
  setCategoriaPerdaSel: (v: NonNullable<Cliente['categoriaPerda']>) => void
  confirmPerda: () => void
  loggedUser?: Vendedor | null
  // Amostra
  showModalAmostra: boolean
  setShowModalAmostra: (v: boolean) => void
  modalAmostraData: string
  setModalAmostraData: (v: string) => void
  confirmAmostra: () => void
  // Proposta
  showModalProposta: boolean
  setShowModalProposta: (v: boolean) => void
  modalPropostaValor: string
  setModalPropostaValor: (v: string) => void
  confirmProposta: () => void
  // Shared
  draggedItem: DragItem | null
  setDraggedItem: (v: DragItem | null) => void
  setPendingDrop: (v: any) => void
}

const perdaCategorias: { key: NonNullable<Cliente['categoriaPerda']>; label: string; active: string }[] = [
  { key: 'preco', label: '💲 Preço', active: 'border-yellow-500 bg-yellow-50 text-yellow-800' },
  { key: 'prazo', label: '⏰ Prazo', active: 'border-orange-500 bg-orange-50 text-orange-800' },
  { key: 'qualidade', label: '⭐ Qualidade', active: 'border-blue-500 bg-blue-50 text-blue-800' },
  { key: 'concorrencia', label: '🏁 Concorrência', active: 'border-red-500 bg-red-50 text-red-800' },
  { key: 'sem_resposta', label: '📵 Sem resposta', active: 'border-gray-500 bg-gray-50 text-gray-800' },
  { key: 'outro', label: '📝 Outro', active: 'border-purple-500 bg-purple-50 text-purple-800' },
]

export default function FunilModals({
  showMotivoPerda, setShowMotivoPerda, motivoPerdaTexto, setMotivoPerdaTexto,
  categoriaPerdaSel, setCategoriaPerdaSel, confirmPerda, loggedUser,
  showModalAmostra, setShowModalAmostra, modalAmostraData, setModalAmostraData, confirmAmostra,
  showModalProposta, setShowModalProposta, modalPropostaValor, setModalPropostaValor, confirmProposta,
  draggedItem, setDraggedItem, setPendingDrop
}: FunilModalsProps) {
  const agora = new Date()
  const dataHoraAtual = `${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  const cancelPerda = () => { setShowMotivoPerda(false); setDraggedItem(null); setPendingDrop(null); setMotivoPerdaTexto(''); setCategoriaPerdaSel('outro') }
  const cancelAmostra = () => { setShowModalAmostra(false); setDraggedItem(null); setPendingDrop(null) }
  const cancelProposta = () => { setShowModalProposta(false); setDraggedItem(null); setPendingDrop(null); setModalPropostaValor('') }

  return (
    <>
      {/* Modal Motivo de Perda */}
      {showMotivoPerda && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelPerda}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">❌ Marcar como Perdido</h2>
            <div className="mb-4 space-y-1">
              <p className="text-sm text-gray-600">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
              <div className="flex items-center gap-3 text-xs text-gray-400 bg-gray-50 rounded-apple px-3 py-2 border border-gray-200">
                <span>👤 <span className="font-medium text-gray-600">{loggedUser?.nome || 'Usuário'}</span></span>
                <span>·</span>
                <span>🕐 {dataHoraAtual}</span>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {perdaCategorias.map(cat => (
                <button key={cat.key} onClick={() => setCategoriaPerdaSel(cat.key)}
                  className={`px-2 py-2 text-xs font-medium rounded-apple border-2 transition-all ${categoriaPerdaSel === cat.key ? cat.active : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                >{cat.label}</button>
              ))}
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da perda <span className="text-red-500">*</span></label>
            <textarea value={motivoPerdaTexto} onChange={(e) => setMotivoPerdaTexto(e.target.value)} rows={2} placeholder="Descreva o motivo da perda... (obrigatório)" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={cancelPerda} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmPerda} disabled={!categoriaPerdaSel || !motivoPerdaTexto.trim()} className="px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Envio de Amostra */}
      {showModalAmostra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelAmostra}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">📦 Enviar Amostra</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de envio da amostra</label>
            <input type="date" value={modalAmostraData} onChange={(e) => setModalAmostraData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2 text-sm" />
            <p className="text-xs text-gray-500 mb-4">O prazo de 30 dias para resposta começará a contar a partir desta data.</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelAmostra} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmAmostra} className="px-4 py-2 bg-yellow-600 text-white rounded-apple hover:bg-yellow-700 text-sm font-medium">Confirmar Envio</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Valor da Proposta */}
      {showModalProposta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cancelProposta}>
          <div className="bg-white rounded-apple shadow-apple-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">💰 Nova Negociação</h2>
            <p className="text-sm text-gray-600 mb-4">Cliente: <span className="font-medium">{draggedItem?.cliente.razaoSocial}</span></p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor da proposta (R$)</label>
            <input type="number" value={modalPropostaValor} onChange={(e) => setModalPropostaValor(e.target.value)} placeholder="Ex: 150000" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm" />
            <div className="flex justify-end gap-3">
              <button onClick={cancelProposta} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50 text-sm">Cancelar</button>
              <button onClick={confirmProposta} className="px-4 py-2 bg-purple-600 text-white rounded-apple hover:bg-purple-700 text-sm font-medium">Iniciar Negociação</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
