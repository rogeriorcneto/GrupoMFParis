import React from 'react'
import type { Cliente, Interacao } from '../../types'

const AutomacoesView: React.FC<{
  clientes: Cliente[]
  onAction: (cliente: Cliente, canal: Interacao['tipo'], tipo: 'propaganda' | 'contato') => void
}> = ({ clientes, onAction }) => {
  const [selectedClienteId, setSelectedClienteId] = React.useState<number>(clientes[0]?.id ?? 0)
  const selectedCliente = clientes.find((c) => c.id === selectedClienteId) ?? null

  const disabled = !selectedCliente

  const actionButtonClass = (variant: 'primary' | 'secondary') =>
    variant === 'primary'
      ? 'px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors duration-200 shadow-apple-sm'
      : 'px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-apple hover:bg-gray-50 transition-colors duration-200'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Automações de Vendas</h1>
        <p className="mt-1 text-sm text-gray-600">Dispare ações rápidas (MVP) por canal e registre no histórico.</p>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead / Empresa</label>
            <select
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial}
                </option>
              ))}
            </select>

            {selectedCliente && (
              <div className="mt-4 rounded-apple border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-medium text-gray-900">{selectedCliente.razaoSocial}</div>
                <div className="text-xs text-gray-600 mt-1">Contato: {selectedCliente.contatoNome}</div>
                <div className="text-xs text-gray-600">Email: {selectedCliente.contatoEmail}</div>
                <div className="text-xs text-gray-600">WhatsApp: {selectedCliente.contatoTelefone}</div>
                <div className="text-xs text-gray-600">Etapa: {selectedCliente.etapa}</div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-apple border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Propaganda automática</div>
                <div className="text-xs text-gray-600 mt-1">Disparo rápido por canal (registrado no histórico).</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'whatsapp', 'propaganda')} className={actionButtonClass('primary')}>WhatsApp</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'email', 'propaganda')} className={actionButtonClass('primary')}>Email</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'instagram', 'propaganda')} className={actionButtonClass('primary')}>Instagram</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'linkedin', 'propaganda')} className={actionButtonClass('primary')}>LinkedIn</button>
                </div>
              </div>

              <div className="rounded-apple border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Entrar em contato</div>
                <div className="text-xs text-gray-600 mt-1">Ação de contato (registrada no histórico).</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'whatsapp', 'contato')} className={actionButtonClass('secondary')}>WhatsApp</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'email', 'contato')} className={actionButtonClass('secondary')}>Email</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'instagram', 'contato')} className={actionButtonClass('secondary')}>Instagram</button>
                  <button disabled={disabled} onClick={() => selectedCliente && onAction(selectedCliente, 'linkedin', 'contato')} className={actionButtonClass('secondary')}>LinkedIn</button>
                </div>
              </div>
            </div>

            <div className="rounded-apple border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Templates (layout MVP)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-50 border border-gray-200 rounded-apple p-3">
                  <div className="text-xs font-medium text-gray-700">Template: Propaganda</div>
                  <div className="text-xs text-gray-600 mt-1">Olá {selectedCliente?.contatoNome || '[Nome]'}, temos condições especiais em produtos MF Paris. Quer receber o catálogo?</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-apple p-3">
                  <div className="text-xs font-medium text-gray-700">Template: Follow-up</div>
                  <div className="text-xs text-gray-600 mt-1">Oi {selectedCliente?.contatoNome || '[Nome]'}, passando para confirmar se você conseguiu analisar nossa proposta. Posso ajudar em algo?</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="text-sm font-semibold text-gray-900">Campanhas (layout)</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="rounded-apple border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">Recuperação de inativos</div>
            <div className="text-xs text-gray-600 mt-1">Sequência WhatsApp + Email</div>
            <div className="text-xs text-gray-500 mt-2">Status: rascunho</div>
          </div>
          <div className="rounded-apple border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">Lançamento de catálogo</div>
            <div className="text-xs text-gray-600 mt-1">Email + LinkedIn</div>
            <div className="text-xs text-gray-500 mt-2">Status: rascunho</div>
          </div>
          <div className="rounded-apple border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-900">Novos leads</div>
            <div className="text-xs text-gray-600 mt-1">Instagram + WhatsApp</div>
            <div className="text-xs text-gray-500 mt-2">Status: rascunho</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AutomacoesView
