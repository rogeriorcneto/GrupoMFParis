import React, { useState } from 'react'
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'
import type { Cliente, Pedido, Vendedor, Interacao, AICommand } from '../types'
import { callAI, buildCRMContext } from '../lib/gemini'
import type { AIMessage } from '../lib/gemini'

interface AIModalProps {
  show: boolean
  onClose: () => void
  clientes: Cliente[]
  pedidos?: Pedido[]
  vendedores?: Vendedor[]
  interacoes?: Interacao[]
}

export default function AIModal({ show, onClose, clientes, pedidos = [], vendedores = [], interacoes = [] }: AIModalProps) {
  const [aiCommand, setAICommand] = useState('')
  const [aiResponse, setAIResponse] = useState('')
  const [aiCommands, setAICommands] = useState<AICommand[]>([])
  const [isAILoading, setIsAILoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const processAICommand = async (command: string) => {
    if (!command.trim()) return
    setIsAILoading(true)
    setAiError(null)
    try {
      const systemPrompt = buildCRMContext({ clientes, pedidos, vendedores, interacoes })
      const history: AIMessage[] = aiCommands
        .slice(0, 5)
        .reverse()
        .flatMap(c => [
          { role: 'user' as const, content: c.command },
          { role: 'assistant' as const, content: c.response },
        ])
      history.push({ role: 'user', content: command })
      const response = await callAI(history, systemPrompt)
      const newCommand: AICommand = {
        id: Date.now().toString(),
        command,
        response,
        timestamp: new Date().toLocaleString('pt-BR'),
      }
      setAICommands(prev => [newCommand, ...prev.slice(0, 9)])
      setAIResponse(response)
    } catch (err: any) {
      setAiError(err?.message || 'Erro ao conectar com a IA.')
    } finally {
      setIsAILoading(false)
    }
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-apple">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-white" />
              <h2 className="text-lg font-semibold text-white">Assistente IA — Gemini</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors duration-200"
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
                {aiError && (
                  <div className="bg-red-50 rounded-apple p-3 border border-red-200">
                    <p className="text-xs text-red-700">⚠️ {aiError}</p>
                  </div>
                )}
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
