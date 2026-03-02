import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { Cliente, AICommand } from '../types'

interface AIModalProps {
  show: boolean
  onClose: () => void
  clientes: Cliente[]
}

export default function AIModal({ show, onClose, clientes }: AIModalProps) {
  const [aiCommand, setAICommand] = useState('')
  const [aiResponse, setAIResponse] = useState('')
  const [aiCommands, setAICommands] = useState<AICommand[]>([])
  const [isAILoading, setIsAILoading] = useState(false)

  const processAICommand = async (command: string) => {
    setIsAILoading(true)
    
    // Simulate AI processing
    setTimeout(() => {
      let response = ''
      
      if (command.toLowerCase().includes('leads inativos')) {
        const inativos = clientes.filter(c => (c.diasInativo || 0) > 30)
        response = `Encontrei ${inativos.length} leads inativos há mais de 30 dias:\n\n${inativos.map(c => 
          `• ${c.razaoSocial} - ${c.diasInativo} dias sem contato (${c.contatoEmail})`
        ).join('\n')}\n\nDeseja que eu envie um follow-up automático para todos?`
      } else if (command.toLowerCase().includes('follow-up')) {
        response = 'Follow-ups agendados com sucesso! 3 emails serão enviados hoje e 2 amanhã. Usarei templates personalizados para cada cliente.'
      } else if (command.toLowerCase().includes('priorizar')) {
        const top = clientes.filter(c => c.etapa !== 'perdido').sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3)
        response = top.length ? `Clientes priorizados por score:\n\n${top.map((c, i) => `${i+1}. ${c.razaoSocial} (Score: ${c.score || 0}) - ${c.etapa}`).join('\n')}\n\nFoco de hoje: ${top[0].razaoSocial}` : 'Nenhum cliente cadastrado ainda. Adicione clientes para priorizar.'
      } else if (command.toLowerCase().includes('relatório')) {
        const total = clientes.length
        const ativos = clientes.filter(c => (c.diasInativo || 0) <= 15).length
        const conversao = clientes.filter(c => c.etapa === 'pos_venda').length
        response = total > 0 ? `📊 Relatório Semanal:\n\n• Total leads: ${total}\n• Leads ativos: ${ativos}\n• Taxa ativação: ${((ativos/total) * 100).toFixed(1)}%\n• Conversões: ${conversao}\n• Ticket médio: R$ ${(clientes.reduce((sum, c) => sum + (c.valorEstimado || 0), 0) / total).toFixed(2)}` : 'Nenhum cliente cadastrado ainda. Adicione clientes para gerar relatórios.'
      } else {
        response = 'Entendido! Posso ajudar com:\n\n• 📋 Listar leads inativos\n• 📤 Enviar follow-ups\n• 🎯 Priorizar clientes\n• 📊 Gerar relatórios\n• 🔍 Buscar clientes\n\nO que você precisa?'
      }
      
      const newCommand: AICommand = {
        id: Date.now().toString(),
        command,
        response,
        timestamp: new Date().toLocaleString('pt-BR')
      }
      
      setAICommands(prev => [newCommand, ...prev.slice(0, 9)])
      setAIResponse(response)
      setIsAILoading(false)
    }, 1500)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-full max-w-2xl bg-white rounded-apple shadow-apple border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Assistente Virtual IA</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comando (em português natural)
                </label>
                <textarea
                  value={aiCommand}
                  onChange={(e) => setAICommand(e.target.value)}
                  placeholder="Ex: Lista leads inativos dos últimos 30 dias"
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                />
                <button
                  onClick={() => processAICommand(aiCommand)}
                  disabled={!aiCommand.trim() || isAILoading}
                  className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-apple transition-colors duration-200 shadow-apple-sm flex items-center justify-center"
                >
                  {isAILoading ? 'Processando...' : 'Enviar Comando'}
                </button>

                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Comandos Rápidos:</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setAICommand('Listar leads inativos dos últimos 30 dias')}
                      className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                    >
                      Leads inativos (30 dias)
                    </button>
                    <button
                      onClick={() => setAICommand('Enviar follow-up automático para leads inativos')}
                      className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                    >
                      Follow-up automático
                    </button>
                    <button
                      onClick={() => setAICommand('Priorizar clientes por score')}
                      className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                    >
                      Priorizar clientes
                    </button>
                    <button
                      onClick={() => setAICommand('Gerar relatório semanal de vendas')}
                      className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-apple border border-gray-200 transition-colors"
                    >
                      Relatório semanal
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resposta da IA
                </label>
                {aiResponse && (
                  <div className="bg-gray-50 rounded-apple p-4 border border-gray-200">
                    <div className="whitespace-pre-wrap text-sm text-gray-800">{aiResponse}</div>
                  </div>
                )}

                {aiCommands.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Histórico:</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {aiCommands.map((cmd) => (
                        <div key={cmd.id} className="bg-white border border-gray-200 rounded-apple p-3">
                          <div className="text-xs text-gray-500 mb-1">{cmd.timestamp}</div>
                          <div className="text-sm font-medium text-gray-900 mb-1">{cmd.command}</div>
                          <div className="text-sm text-gray-700">{cmd.response}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
