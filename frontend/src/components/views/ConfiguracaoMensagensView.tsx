import React, { useState, useMemo, useEffect } from 'react'
import {
  PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon,
  ChevronDownIcon, ChevronUpIcon, PlayIcon, PauseIcon,
  LightBulbIcon, ChatBubbleLeftIcon, EnvelopeIcon
} from '@heroicons/react/24/outline'
import type { Vendedor } from '../../types'
import * as db from '../../lib/database'

// Tipos para mensagens de automação
interface MensagemAutomacao {
  id: number
  nome: string
  ativa: boolean
  gatilho: 'mudanca_etapa' | 'substatus' | 'data_especifica' | 'inatividade'
  condicoes: {
    etapaDestino?: string
    subStatus?: string
    diasInatividade?: number
    diasAposEvento?: number
  }
  config: {
    canal: 'whatsapp' | 'email'
    usarIA: boolean
    promptIA?: string
    mensagemFixa?: string
    instrucoes?: string
  }
}

// Mensagens iniciais
const MENSAGENS_INICIAIS: MensagemAutomacao[] = [
  {
    id: 1,
    nome: 'Pesquisa de satisfação pós-entrega',
    ativa: true,
    gatilho: 'substatus',
    condicoes: { subStatus: 'entregue' },
    config: {
      canal: 'whatsapp',
      usarIA: true,
      promptIA: 'Crie uma mensagem amigável perguntando como foi a experiência com a entrega do produto e solicitando feedback. Seja cordial e profissional.',
      instrucoes: 'Enviada automaticamente após confirmação de entrega'
    }
  },
  {
    id: 2,
    nome: 'Aviso de amostra liberada',
    ativa: true,
    gatilho: 'substatus',
    condicoes: { subStatus: 'liberada' },
    config: {
      canal: 'whatsapp',
      usarIA: false,
      mensagemFixa: 'Olá! Sua amostra foi liberada e está em processo de faturamento. Em breve entraremos em contato com os detalhes de envio. Obrigado!',
      instrucoes: 'Notifica cliente quando amostra é aprovada'
    }
  },
  {
    id: 3,
    nome: 'Reativação de cliente inativo',
    ativa: true,
    gatilho: 'inatividade',
    condicoes: { diasInatividade: 30 },
    config: {
      canal: 'email',
      usarIA: true,
      promptIA: 'Crie um email de reativação para um cliente que não compra há 30 dias. Ofereça ajuda, novidades e incentive uma nova conversa.',
      instrucoes: 'Tentativa de reativar cliente após 30 dias sem interação'
    }
  }
]

// Etapas disponíveis
const ETAPAS = [
  { key: 'lead', label: 'Lead' },
  { key: 'prospecção', label: 'Prospecção' },
  { key: 'amostra', label: 'Amostra' },
  { key: 'amostra_perdida', label: 'Amostra Perdida' },
  { key: 'proposta', label: 'Proposta' },
  { key: 'negociacao', label: 'Negociação' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'inativo', label: 'Inativos' },
  { key: 'perdido', label: 'Perdido' }
]

const GATILHOS = [
  { key: 'mudanca_etapa', label: 'Mudança de Etapa' },
  { key: 'substatus', label: 'Mudança de Sub-status' },
  { key: 'data_especifica', label: 'Data Específica' },
  { key: 'inatividade', label: 'Inatividade' }
]

interface ConfiguracaoMensagensViewProps {
  loggedUser: Vendedor | null
}

const ConfiguracaoMensagensView: React.FC<ConfiguracaoMensagensViewProps> = ({ loggedUser }) => {
  const [mensagens, setMensagens] = useState<MensagemAutomacao[]>([])
  const [editando, setEditando] = useState<number | null>(null)
  const [novaMensagem, setNovaMensagem] = useState<MensagemAutomacao | null>(null)
  const [filtroGatilho, setFiltroGatilho] = useState<string>('todos')
  const [expandedMensagens, setExpandedMensagens] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carregar mensagens do banco
  useEffect(() => {
    const carregarMensagens = async () => {
      try {
        setLoading(true)
        const mensagensDB = await db.getMensagensAutomacao()
        // Se não houver mensagens no banco, inicializa com as padrão
        if (mensagensDB.length === 0) {
          for (const msg of MENSAGENS_INICIAIS) {
            await db.insertMensagemAutomacao(msg)
          }
          const mensagensCriadas = await db.getMensagensAutomacao()
          setMensagens(mensagensCriadas)
        } else {
          setMensagens(mensagensDB)
        }
      } catch (err) {
        console.error('Erro ao carregar mensagens:', err)
        setError('Erro ao carregar mensagens do banco de dados')
        setMensagens(MENSAGENS_INICIAIS)
      } finally {
        setLoading(false)
      }
    }
    carregarMensagens()
  }, [])

  const isGerente = loggedUser?.cargo === 'gerente'

  const mensagensFiltradas = useMemo(() => {
    if (filtroGatilho === 'todos') return mensagens
    return mensagens.filter(m => m.gatilho === filtroGatilho)
  }, [mensagens, filtroGatilho])

  const toggleMensagem = async (id: number) => {
    const mensagem = mensagens.find(m => m.id === id)
    if (!mensagem) return
    
    const novoStatus = !mensagem.ativa
    setMensagens(prev => prev.map(m => m.id === id ? { ...m, ativa: novoStatus } : m))
    
    try {
      await db.updateMensagemAutomacao(id, { ativa: novoStatus })
    } catch (err) {
      console.error('Erro ao atualizar mensagem:', err)
      setMensagens(prev => prev.map(m => m.id === id ? { ...m, ativa: !novoStatus } : m))
    }
  }

  const deleteMensagem = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta mensagem automática?')) return
    
    try {
      await db.deleteMensagemAutomacao(id)
      setMensagens(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Erro ao excluir mensagem:', err)
      alert('Erro ao excluir mensagem. Tente novamente.')
    }
  }

  const saveMensagem = async (mensagem: MensagemAutomacao) => {
    try {
      if (mensagem.id === 0) {
        const novaMensagemDB = await db.insertMensagemAutomacao(mensagem)
        setMensagens(prev => [...prev, novaMensagemDB])
      } else {
        await db.updateMensagemAutomacao(mensagem.id, mensagem)
        setMensagens(prev => prev.map(m => m.id === mensagem.id ? mensagem : m))
      }
      setEditando(null)
      setNovaMensagem(null)
    } catch (err) {
      console.error('Erro ao salvar mensagem:', err)
      alert('Erro ao salvar mensagem. Tente novamente.')
    }
  }

  const startNovaMensagem = () => {
    setNovaMensagem({
      id: 0,
      nome: '',
      ativa: true,
      gatilho: 'substatus',
      condicoes: {},
      config: {
        canal: 'whatsapp',
        usarIA: true,
        promptIA: '',
        instrucoes: ''
      }
    })
  }

  const toggleExpand = (id: number) => {
    setExpandedMensagens(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!isGerente) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border border-gray-200 p-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Acesso Restrito</h2>
            <p className="text-gray-500">Apenas gerentes podem configurar mensagens automáticas.</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Carregando mensagens...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Mensagens Automáticas</h1>
              <p className="text-sm text-gray-500 mt-0.5">Configure mensagens enviadas automaticamente pela IA</p>
            </div>
            <button
              onClick={startNovaMensagem}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Nova Mensagem
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="flex items-center gap-6 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{mensagens.length}</span>
            <span className="text-gray-500">mensagens totais</span>
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-green-600">{mensagens.filter(m => m.ativa).length}</span>
            <span className="text-gray-500">ativas</span>
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-400">{mensagens.filter(m => !m.ativa).length}</span>
            <span className="text-gray-500">inativas</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <span className="text-sm text-gray-500 mr-2">Filtrar:</span>
          <button
            onClick={() => setFiltroGatilho('todos')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filtroGatilho === 'todos' 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}
          >
            Todas
          </button>
          {GATILHOS.map(g => (
            <button
              key={g.key}
              onClick={() => setFiltroGatilho(g.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filtroGatilho === g.key 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="space-y-4">
          {novaMensagem && (
            <MensagemForm
              mensagem={novaMensagem}
              onSave={saveMensagem}
              onCancel={() => setNovaMensagem(null)}
              isNova
            />
          )}

          {mensagensFiltradas.map(mensagem => (
            <div key={mensagem.id}>
              {editando === mensagem.id ? (
                <MensagemForm
                  mensagem={mensagem}
                  onSave={saveMensagem}
                  onCancel={() => setEditando(null)}
                />
              ) : (
                <div className={`bg-white border ${mensagem.ativa ? 'border-gray-200' : 'border-gray-200 bg-gray-50/30'}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => toggleMensagem(mensagem.id)}
                          className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded flex items-center justify-center transition-colors ${
                            mensagem.ativa ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {mensagem.ativa ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-medium text-sm ${mensagem.ativa ? 'text-gray-900' : 'text-gray-500'}`}>
                              {mensagem.nome}
                            </h3>
                            {!mensagem.ativa && (
                              <span className="text-xs text-gray-400">(inativa)</span>
                            )}
                            {mensagem.config.usarIA && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">IA</span>
                            )}
                          </div>

                          <p className="text-xs text-gray-500 mb-2">
                            {GATILHOS.find(g => g.key === mensagem.gatilho)?.label}
                            {mensagem.condicoes.subStatus && (
                              <> • Status: {mensagem.condicoes.subStatus}</>
                            )}
                            {mensagem.condicoes.diasInatividade && (
                              <> • Inatividade: {mensagem.condicoes.diasInatividade}d</>
                            )}
                          </p>

                          <div className="flex items-center gap-2 text-xs">
                            {mensagem.config.canal === 'whatsapp' ? (
                              <><ChatBubbleLeftIcon className="h-3 w-3" /> WhatsApp</>
                            ) : (
                              <><EnvelopeIcon className="h-3 w-3" /> Email</>
                            )}
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-700 truncate">
                              {mensagem.config.usarIA 
                                ? 'Mensagem gerada por IA'
                                : mensagem.config.mensagemFixa?.substring(0, 50) + '...'
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => toggleExpand(mensagem.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        >
                          {expandedMensagens.has(mensagem.id) ? (
                            <ChevronUpIcon className="h-4 w-4" />
                          ) : (
                            <ChevronDownIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditando(mensagem.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteMensagem(mensagem.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {expandedMensagens.has(mensagem.id) && (
                    <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                      <div className="space-y-4 text-sm">
                        <div>
                          <p className="font-medium text-gray-700 mb-2">Condições:</p>
                          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                            {mensagem.condicoes.etapaDestino && (
                              <p><span className="text-gray-500">Etapa:</span> {ETAPAS.find(e => e.key === mensagem.condicoes.etapaDestino)?.label}</p>
                            )}
                            {mensagem.condicoes.subStatus && (
                              <p><span className="text-gray-500">Sub-status:</span> {mensagem.condicoes.subStatus}</p>
                            )}
                            {mensagem.condicoes.diasInatividade && (
                              <p><span className="text-gray-500">Inatividade:</span> {mensagem.condicoes.diasInatividade} dias</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-gray-700 mb-2">Configuração da Mensagem:</p>
                          <div className="bg-purple-50 rounded-lg p-3 space-y-2">
                            <p><span className="text-gray-500">Canal:</span> {mensagem.config.canal === 'whatsapp' ? 'WhatsApp' : 'Email'}</p>
                            <p><span className="text-gray-500">Usar IA:</span> {mensagem.config.usarIA ? 'Sim' : 'Não'}</p>
                            {mensagem.config.usarIA && mensagem.config.promptIA && (
                              <div>
                                <p className="text-gray-500">Instrução para IA:</p>
                                <p className="text-gray-700 mt-1 italic">"{mensagem.config.promptIA}"</p>
                              </div>
                            )}
                            {!mensagem.config.usarIA && mensagem.config.mensagemFixa && (
                              <div>
                                <p className="text-gray-500">Mensagem:</p>
                                <p className="text-gray-700 mt-1">{mensagem.config.mensagemFixa}</p>
                              </div>
                            )}
                            {mensagem.config.instrucoes && (
                              <p className="text-xs text-gray-500 mt-2">{mensagem.config.instrucoes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-start gap-3">
            <LightBulbIcon className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">Como funciona?</h4>
              <p className="text-sm text-blue-700">
                Quando um evento configurado ocorre, o sistema envia automaticamente uma mensagem via WhatsApp ou Email. 
                Você pode usar mensagens fixas ou deixar a IA gerar mensagens personalizadas para cada cliente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Formulário de mensagem
interface MensagemFormProps {
  mensagem: MensagemAutomacao
  onSave: (mensagem: MensagemAutomacao) => void
  onCancel: () => void
  isNova?: boolean
}

const MensagemForm: React.FC<MensagemFormProps> = ({ mensagem: initialMensagem, onSave, onCancel, isNova }) => {
  const [mensagem, setMensagem] = useState(initialMensagem)

  const handleSave = () => {
    if (!mensagem.nome) {
      alert('Preencha o nome da mensagem')
      return
    }
    if (mensagem.config.usarIA && !mensagem.config.promptIA) {
      alert('Preencha as instruções para a IA')
      return
    }
    if (!mensagem.config.usarIA && !mensagem.config.mensagemFixa) {
      alert('Preencha a mensagem fixa')
      return
    }
    onSave(mensagem)
  }

  return (
    <div className="bg-white border border-gray-200 shadow-sm">
      <div className="p-5">
        <div className="mb-5">
          <h3 className="font-medium text-gray-900">{isNova ? 'Nova Mensagem Automática' : 'Editar Mensagem'}</h3>
          <p className="text-sm text-gray-500">Configure quando e como enviar a mensagem</p>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                value={mensagem.nome}
                onChange={e => setMensagem(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Pesquisa de satisfação"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gatilho</label>
              <select
                value={mensagem.gatilho}
                onChange={e => setMensagem(prev => ({ ...prev, gatilho: e.target.value as any, condicoes: {} }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              >
                {GATILHOS.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>

            {mensagem.gatilho === 'mudanca_etapa' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etapa de Destino</label>
                <select
                  value={mensagem.condicoes.etapaDestino || ''}
                  onChange={e => setMensagem(prev => ({ ...prev, condicoes: { ...prev.condicoes, etapaDestino: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Selecione...</option>
                  {ETAPAS.map(e => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </div>
            )}

            {mensagem.gatilho === 'substatus' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sub-status</label>
                <input
                  type="text"
                  value={mensagem.condicoes.subStatus || ''}
                  onChange={e => setMensagem(prev => ({ ...prev, condicoes: { ...prev.condicoes, subStatus: e.target.value } }))}
                  placeholder="Ex: entregue, aprovada"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {mensagem.gatilho === 'inatividade' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dias de Inatividade</label>
                <input
                  type="number"
                  min={1}
                  value={mensagem.condicoes.diasInatividade || 30}
                  onChange={e => setMensagem(prev => ({ ...prev, condicoes: { ...prev.condicoes, diasInatividade: parseInt(e.target.value) } }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
              <select
                value={mensagem.config.canal}
                onChange={e => setMensagem(prev => ({ ...prev, config: { ...prev.config, canal: e.target.value as any } }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <input
                  type="checkbox"
                  checked={mensagem.config.usarIA}
                  onChange={e => setMensagem(prev => ({ ...prev, config: { ...prev.config, usarIA: e.target.checked } }))}
                  className="rounded border-gray-300"
                />
                Usar IA para gerar mensagem
              </label>
            </div>

            {mensagem.config.usarIA ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instruções para IA</label>
                <textarea
                  value={mensagem.config.promptIA || ''}
                  onChange={e => setMensagem(prev => ({ ...prev, config: { ...prev.config, promptIA: e.target.value } }))}
                  rows={4}
                  placeholder="Ex: Crie uma mensagem amigável perguntando sobre a experiência de compra..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem Fixa</label>
                <textarea
                  value={mensagem.config.mensagemFixa || ''}
                  onChange={e => setMensagem(prev => ({ ...prev, config: { ...prev.config, mensagemFixa: e.target.value } }))}
                  rows={4}
                  placeholder="Digite a mensagem que será enviada..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instruções Internas (opcional)</label>
              <input
                type="text"
                value={mensagem.config.instrucoes || ''}
                onChange={e => setMensagem(prev => ({ ...prev, config: { ...prev.config, instrucoes: e.target.value } }))}
                placeholder="Ex: Enviar apenas em horário comercial"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            <CheckIcon className="h-4 w-4" />
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfiguracaoMensagensView
