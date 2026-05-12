import React, { useState, useMemo, useEffect } from 'react'
import {
  PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon,
  ChevronDownIcon, ChevronUpIcon, Cog6ToothIcon,
  ClockIcon, ArrowPathIcon, BellIcon, FunnelIcon,
  PlayIcon, PauseIcon, LightBulbIcon
} from '@heroicons/react/24/outline'
import type { Vendedor } from '../../types'
import * as db from '../../lib/database'

// Tipos para regras de automação
interface RegraAutomacao {
  id: number
  nome: string
  ativa: boolean
  gatilho: 'mudanca_etapa' | 'inatividade' | 'substatus' | 'data_especifica' | 'reconquista' | 'tarefa_concluida'
  condicoes: {
    etapaOrigem?: string
    etapaDestino?: string
    diasInatividade?: number
    subStatus?: string
    diasDesdeEvento?: number
    tipoTarefaConcluida?: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'follow-up' | 'outro' | 'qualquer'
    tarefaEspecifica?: string
    etapaCliente?: string
  }
  acao: {
    titulo: string
    descricao: string
    tipo: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'outro'
    prioridade: 'alta' | 'media' | 'baixa'
    diasPrazo: number
  }
}

// Configuração inicial com as regras atuais do sistema
const REGRAS_INICIAIS: RegraAutomacao[] = [
  {
    id: 1,
    nome: 'Follow-up após amostra',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'amostra' },
    acao: {
      titulo: 'Follow-up amostra — {cliente}',
      descricao: 'Verificar se o cliente recebeu e analisou a amostra',
      tipo: 'ligacao',
      prioridade: 'media',
      diasPrazo: 20
    }
  },
  {
    id: 2,
    nome: 'Cobrança resultado amostra (45 dias)',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'amostra' },
    acao: {
      titulo: 'Cobrar resultado amostra — {cliente}',
      descricao: 'Prazo de 45 dias se aproximando. Cobrar retorno urgente.',
      tipo: 'ligacao',
      prioridade: 'alta',
      diasPrazo: 40,
      horaPadrao: '09:00'
    }
  },
  {
    id: 3,
    nome: 'Preparar proposta',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'proposta' },
    acao: {
      titulo: 'Preparar proposta — {cliente}',
      descricao: 'Amostra aprovada. Preparar e enviar proposta comercial.',
      tipo: 'reuniao',
      prioridade: 'alta',
      diasPrazo: 5
    }
  },
  {
    id: 4,
    nome: 'Follow-up proposta',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'proposta' },
    acao: {
      titulo: 'Follow-up proposta — {cliente}',
      descricao: 'Verificar se o cliente analisou a proposta.',
      tipo: 'ligacao',
      prioridade: 'media',
      diasPrazo: 15
    }
  },
  {
    id: 5,
    nome: 'Cobrar resposta proposta',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'negociacao' },
    acao: {
      titulo: 'Cobrar resposta proposta — {cliente}',
      descricao: 'Verificar retorno da proposta comercial enviada.',
      tipo: 'ligacao',
      prioridade: 'alta',
      diasPrazo: 7
    }
  },
  {
    id: 6,
    nome: 'Acompanhar logística',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'follow_up' },
    acao: {
      titulo: 'Acompanhar logística — {cliente}',
      descricao: 'Pedido aprovado. Acompanhar produção e entrega.',
      tipo: 'ligacao',
      prioridade: 'media',
      diasPrazo: 7,
      horaPadrao: '11:00'
    }
  },
  {
    id: 7,
    nome: 'Coletar satisfação',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'follow_up' },
    acao: {
      titulo: 'Coletar satisfação — {cliente}',
      descricao: 'Após entrega, avaliar satisfação do cliente.',
      tipo: 'email',
      prioridade: 'media',
      diasPrazo: 30,
      horaPadrao: '14:00'
    }
  },
  {
    id: 8,
    nome: 'Preparar próximo ciclo',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'follow_up' },
    acao: {
      titulo: 'Preparar proposta comercial — {cliente}',
      descricao: 'Cliente em Follow-up. Preparar nova proposta para próximo ciclo de compra.',
      tipo: 'reuniao',
      prioridade: 'alta',
      diasPrazo: 15,
      horaPadrao: '09:00'
    }
  },
  {
    id: 9,
    nome: 'Avaliar 2ª tentativa amostra',
    ativa: true,
    gatilho: 'mudanca_etapa',
    condicoes: { etapaDestino: 'amostra_perdida' },
    acao: {
      titulo: 'Avaliar 2ª tentativa amostra — {cliente}',
      descricao: 'Amostra reprovada. Avaliar se vale tentar novamente.',
      tipo: 'reuniao',
      prioridade: 'alta',
      diasPrazo: 3
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
  { key: 'mudanca_etapa', label: 'Mudança de Etapa', desc: 'Quando cliente move de uma etapa para outra' },
  { key: 'tarefa_concluida', label: 'Tarefa Concluída', desc: 'Quando uma tarefa específica é concluída em uma etapa' },
  { key: 'inatividade', label: 'Inatividade', desc: 'Quando cliente fica sem interação por X dias' },
  { key: 'substatus', label: 'Mudança de Sub-status', desc: 'Quando status interno muda (ex: amostra entregue)' },
  { key: 'data_especifica', label: 'Data Específica', desc: 'X dias após um evento específico' },
  { key: 'reconquista', label: 'Reconquista', desc: 'Quando cliente perdido pode ser reativado' }
]

const TIPOS_TAREFA = [
  { key: 'ligacao', label: 'Ligação', icon: '📞' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'reuniao', label: 'Reunião', icon: '🤝' },
  { key: 'outro', label: 'Outro', icon: '📝' }
]

interface ConfiguracaoTarefasViewProps {
  loggedUser: Vendedor | null
}

const ConfiguracaoTarefasView: React.FC<ConfiguracaoTarefasViewProps> = ({ loggedUser }) => {
  const [regras, setRegras] = useState<RegraAutomacao[]>([])
  const [editando, setEditando] = useState<number | null>(null)
  const [novaRegra, setNovaRegra] = useState<RegraAutomacao | null>(null)
  const [filtroGatilho, setFiltroGatilho] = useState<string>('todos')
  const [expandedRegras, setExpandedRegras] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carregar regras do banco
  useEffect(() => {
    const carregarRegras = async () => {
      try {
        setLoading(true)
        const regrasDB = await db.getRegrasAutomacao()
        // Se não houver regras no banco, inicializa com as padrão
        if (regrasDB.length === 0) {
          // Criar regras iniciais no banco
          for (const regra of REGRAS_INICIAIS) {
            await db.insertRegraAutomacao(regra)
          }
          const regrasCriadas = await db.getRegrasAutomacao()
          setRegras(regrasCriadas)
        } else {
          setRegras(regrasDB)
        }
      } catch (err) {
        console.error('Erro ao carregar regras:', err)
        setError('Erro ao carregar regras do banco de dados')
        // Fallback para regras locais
        setRegras(REGRAS_INICIAIS)
      } finally {
        setLoading(false)
      }
    }
    carregarRegras()
  }, [])

  const isGerente = loggedUser?.cargo === 'gerente'

  const regrasFiltradas = useMemo(() => {
    if (filtroGatilho === 'todos') return regras
    return regras.filter(r => r.gatilho === filtroGatilho)
  }, [regras, filtroGatilho])

  const toggleRegra = async (id: number) => {
    const regra = regras.find(r => r.id === id)
    if (!regra) return
    
    const novoStatus = !regra.ativa
    setRegras(prev => prev.map(r => r.id === id ? { ...r, ativa: novoStatus } : r))
    
    try {
      await db.updateRegraAutomacao(id, { ativa: novoStatus })
    } catch (err) {
      console.error('Erro ao atualizar regra:', err)
      // Reverter em caso de erro
      setRegras(prev => prev.map(r => r.id === id ? { ...r, ativa: !novoStatus } : r))
    }
  }

  const deleteRegra = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return
    
    try {
      await db.deleteRegraAutomacao(id)
      setRegras(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Erro ao excluir regra:', err)
      alert('Erro ao excluir regra. Tente novamente.')
    }
  }

  const saveRegra = async (regra: RegraAutomacao) => {
    try {
      if (regra.id === 0) {
        // Nova regra
        const novaRegraDB = await db.insertRegraAutomacao(regra)
        setRegras(prev => [...prev, novaRegraDB])
      } else {
        // Editar existente
        await db.updateRegraAutomacao(regra.id, regra)
        setRegras(prev => prev.map(r => r.id === regra.id ? regra : r))
      }
      setEditando(null)
      setNovaRegra(null)
    } catch (err: any) {
      console.error('Erro ao salvar regra:', err)
      const errorMessage = err?.message || ''
      if (errorMessage.includes('does not exist') || errorMessage.includes('não existe')) {
        alert('ERRO: A tabela de regras não existe no banco de dados.\n\nExecute o SQL de migração no Supabase:\n/regras_automacao_tarefas_mensagens.sql')
      } else {
        alert('Erro ao salvar regra: ' + (err?.message || 'Erro desconhecido'))
      }
    }
  }

  const startNovaRegra = () => {
    setNovaRegra({
      id: 0,
      nome: '',
      ativa: true,
      gatilho: 'mudanca_etapa',
      condicoes: { etapaDestino: 'prospecção' },
      acao: {
        titulo: '',
        descricao: '',
        tipo: 'ligacao',
        prioridade: 'media',
        diasPrazo: 7
      }
    })
  }

  const toggleExpand = (id: number) => {
    setExpandedRegras(prev => {
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
            <p className="text-gray-500">Apenas gerentes podem configurar automações de tarefas.</p>
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
          <p className="text-gray-500">Carregando regras...</p>
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
              <h1 className="text-lg font-semibold text-gray-900">Automação de Tarefas</h1>
              <p className="text-sm text-gray-500 mt-0.5">Configure regras para criar tarefas automaticamente</p>
            </div>
            <button
              onClick={startNovaRegra}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Nova Regra
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Stats simplificados */}
        <div className="flex items-center gap-6 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{regras.length}</span>
            <span className="text-gray-500">regras totais</span>
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-green-600">{regras.filter(r => r.ativa).length}</span>
            <span className="text-gray-500">ativas</span>
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-400">{regras.filter(r => !r.ativa).length}</span>
            <span className="text-gray-500">inativas</span>
          </div>
        </div>

        {/* Filtros inline */}
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

        {/* Lista de Regras */}
        <div className="space-y-4">
          {/* Nova Regra Form */}
          {novaRegra && (
            <RegraForm
              regra={novaRegra}
              onSave={saveRegra}
              onCancel={() => setNovaRegra(null)}
              isNova
            />
          )}

          {/* Regras existentes */}
          {regrasFiltradas.map(regra => (
            <div key={regra.id}>
              {editando === regra.id ? (
                <RegraForm
                  regra={regra}
                  onSave={saveRegra}
                  onCancel={() => setEditando(null)}
                />
              ) : (
                <div className={`bg-white border ${regra.ativa ? 'border-gray-200' : 'border-gray-200 bg-gray-50/30'}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Ícone de status */}
                        <button
                          onClick={() => toggleRegra(regra.id)}
                          className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded flex items-center justify-center transition-colors ${
                            regra.ativa ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                          }`}
                          title={regra.ativa ? 'Desativar regra' : 'Ativar regra'}
                        >
                          {regra.ativa ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-medium text-sm ${regra.ativa ? 'text-gray-900' : 'text-gray-500'}`}>
                              {regra.nome}
                            </h3>
                            {!regra.ativa && (
                              <span className="text-xs text-gray-400">(inativa)</span>
                            )}
                          </div>

                          <p className="text-xs text-gray-500 mb-2">
                            {GATILHOS.find(g => g.key === regra.gatilho)?.label}
                            {regra.condicoes.tarefaEspecifica && (
                              <> • "{regra.condicoes.tarefaEspecifica}"</>
                            )}
                            {regra.condicoes.etapaDestino && (
                              <> • {ETAPAS.find(e => e.key === regra.condicoes.etapaDestino)?.label}</>
                            )}
                            {regra.condicoes.diasInatividade && (
                              <> • Inatividade: {regra.condicoes.diasInatividade}d</>
                            )}
                            {regra.condicoes.tipoTarefaConcluida && regra.condicoes.tipoTarefaConcluida !== 'qualquer' && (
                              <> • {TIPOS_TAREFA.find(t => t.key === regra.condicoes.tipoTarefaConcluida)?.icon} {TIPOS_TAREFA.find(t => t.key === regra.condicoes.tipoTarefaConcluida)?.label}</>
                            )}
                            {regra.condicoes.etapaCliente && (
                              <> em {ETAPAS.find(e => e.key === regra.condicoes.etapaCliente)?.label}</>
                            )}
                            {regra.condicoes.subStatus && (
                              <> • {regra.condicoes.subStatus}</>
                            )}
                          </p>

                          {/* Preview da ação */}
                          <div className="flex items-center gap-2 text-xs">
                            <span>{TIPOS_TAREFA.find(t => t.key === regra.acao.tipo)?.icon}</span>
                            <span className="text-gray-700 truncate">{regra.acao.titulo}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              regra.acao.prioridade === 'alta' ? 'bg-red-50 text-red-600' :
                              regra.acao.prioridade === 'media' ? 'bg-amber-50 text-amber-600' :
                              'bg-blue-50 text-blue-600'
                            }`}>
                              {regra.acao.prioridade}
                            </span>
                            <span className="text-gray-400">• {regra.acao.diasPrazo}d</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => toggleExpand(regra.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        >
                          {expandedRegras.has(regra.id) ? (
                            <ChevronUpIcon className="h-4 w-4" />
                          ) : (
                            <ChevronDownIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditando(regra.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteRegra(regra.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes expandidos */}
                  {expandedRegras.has(regra.id) && (
                    <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                      <div className="grid grid-cols-2 gap-6 text-sm">
                        <div>
                          <p className="font-medium text-gray-700 mb-2">Condições:</p>
                          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                            {regra.condicoes.etapaOrigem && (
                              <p><span className="text-gray-500">Etapa origem:</span> {ETAPAS.find(e => e.key === regra.condicoes.etapaOrigem)?.label}</p>
                            )}
                            {regra.condicoes.etapaDestino && (
                              <p><span className="text-gray-500">Etapa destino:</span> {ETAPAS.find(e => e.key === regra.condicoes.etapaDestino)?.label}</p>
                            )}
                            {regra.condicoes.diasInatividade && (
                              <p><span className="text-gray-500">Dias inatividade:</span> {regra.condicoes.diasInatividade}</p>
                            )}
                            {regra.condicoes.subStatus && (
                              <p><span className="text-gray-500">Sub-status:</span> {regra.condicoes.subStatus}</p>
                            )}
                            {regra.condicoes.tarefaEspecifica && (
                              <p><span className="text-gray-500">Tarefa específica:</span> "{regra.condicoes.tarefaEspecifica}"</p>
                            )}
                            {regra.condicoes.tipoTarefaConcluida && (
                              <p><span className="text-gray-500">Tipo de tarefa:</span> {regra.condicoes.tipoTarefaConcluida === 'qualquer' ? 'Qualquer tipo' : TIPOS_TAREFA.find(t => t.key === regra.condicoes.tipoTarefaConcluida)?.label}</p>
                            )}
                            {regra.condicoes.etapaCliente && (
                              <p><span className="text-gray-500">Etapa do cliente:</span> {ETAPAS.find(e => e.key === regra.condicoes.etapaCliente)?.label}</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-gray-700 mb-2">Ação (Tarefa criada):</p>
                          <div className="bg-primary-50 rounded-lg p-3 space-y-1">
                            <p><span className="text-gray-500">Título:</span> {regra.acao.titulo}</p>
                            <p><span className="text-gray-500">Descrição:</span> {regra.acao.descricao}</p>
                            <p><span className="text-gray-500">Tipo:</span> {TIPOS_TAREFA.find(t => t.key === regra.acao.tipo)?.label}</p>
                            <p><span className="text-gray-500">Prioridade:</span> {regra.acao.prioridade}</p>
                            <p><span className="text-gray-500">Prazo:</span> {regra.acao.diasPrazo} dias</p>
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
        <div className="mt-8 bg-blue-50 rounded-2xl border border-blue-200 p-5">
          <div className="flex items-start gap-3">
            <LightBulbIcon className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">Como funciona?</h4>
              <p className="text-sm text-blue-700">
                Quando um evento configurado ocorre (ex: cliente muda de etapa), o sistema automaticamente cria uma tarefa 
                atribuída ao vendedor responsável. Use <code className="bg-blue-100 px-1 rounded">{'{cliente}'}</code> no título 
                para incluir o nome do cliente automaticamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Componente de formulário para criar/editar regra
interface RegraFormProps {
  regra: RegraAutomacao
  onSave: (regra: RegraAutomacao) => void
  onCancel: () => void
  isNova?: boolean
}

const RegraForm: React.FC<RegraFormProps> = ({ regra: initialRegra, onSave, onCancel, isNova }) => {
  const [regra, setRegra] = useState(initialRegra)

  const handleSave = () => {
    if (!regra.nome || !regra.acao.titulo) {
      alert('Preencha o nome da regra e o título da tarefa')
      return
    }
    onSave(regra)
  }

  return (
    <div className="bg-white border border-gray-200 shadow-sm">
      <div className="p-5">
        <div className="mb-5">
          <h3 className="font-medium text-gray-900">{isNova ? 'Nova Regra de Automação' : 'Editar Regra'}</h3>
          <p className="text-sm text-gray-500">Configure quando e como criar a tarefa automaticamente</p>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Nome e Gatilho */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Regra</label>
              <input
                type="text"
                value={regra.nome}
                onChange={e => setRegra(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Follow-up após amostra"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gatilho (Evento)</label>
              <select
                value={regra.gatilho}
                onChange={e => setRegra(prev => ({ 
                  ...prev, 
                  gatilho: e.target.value as any,
                  condicoes: {}
                }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              >
                {GATILHOS.map(g => (
                  <option key={g.key} value={g.key}>{g.label} - {g.desc}</option>
                ))}
              </select>
            </div>

            {/* Condições específicas */}
            {regra.gatilho === 'mudanca_etapa' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa de Origem (opcional)</label>
                  <select
                    value={regra.condicoes.etapaOrigem || ''}
                    onChange={e => setRegra(prev => ({ 
                      ...prev, 
                      condicoes: { ...prev.condicoes, etapaOrigem: e.target.value || undefined }
                    }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Qualquer etapa</option>
                    {ETAPAS.map(e => (
                      <option key={e.key} value={e.key}>{e.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa de Destino</label>
                  <select
                    value={regra.condicoes.etapaDestino || ''}
                    onChange={e => setRegra(prev => ({ 
                      ...prev, 
                      condicoes: { ...prev.condicoes, etapaDestino: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Selecione...</option>
                    {ETAPAS.map(e => (
                      <option key={e.key} value={e.key}>{e.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {regra.gatilho === 'inatividade' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dias de Inatividade</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={regra.condicoes.diasInatividade || 7}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    condicoes: { ...prev.condicoes, diasInatividade: parseInt(e.target.value) }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {regra.gatilho === 'tarefa_concluida' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarefa Específica (opcional)</label>
                  <input
                    type="text"
                    value={regra.condicoes.tarefaEspecifica || ''}
                    onChange={e => setRegra(prev => ({ 
                      ...prev, 
                      condicoes: { ...prev.condicoes, tarefaEspecifica: e.target.value || undefined }
                    }))}
                    placeholder="Ex: Enviar amostra, Follow-up proposta, Cobrar resultado"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Disparar apenas quando esta tarefa específica for concluída (exato)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Tarefa Concluída</label>
                  <select
                    value={regra.condicoes.tipoTarefaConcluida || 'qualquer'}
                    onChange={e => setRegra(prev => ({ 
                      ...prev, 
                      condicoes: { ...prev.condicoes, tipoTarefaConcluida: e.target.value as any }
                    }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="qualquer">Qualquer tipo</option>
                    {TIPOS_TAREFA.map(t => (
                      <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Disparar quando uma tarefa deste tipo for concluída</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa do Cliente (Kanban)</label>
                  <select
                    value={regra.condicoes.etapaCliente || ''}
                    onChange={e => setRegra(prev => ({ 
                      ...prev, 
                      condicoes: { ...prev.condicoes, etapaCliente: e.target.value || undefined }
                    }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Qualquer etapa</option>
                    {ETAPAS.map(e => (
                      <option key={e.key} value={e.key}>{e.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Apenas se o cliente estiver nesta etapa do funil</p>
                </div>
              </div>
            )}

            {regra.gatilho === 'substatus' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sub-status</label>
                <input
                  type="text"
                  value={regra.condicoes.subStatus || ''}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    condicoes: { ...prev.condicoes, subStatus: e.target.value }
                  }))}
                  placeholder="Ex: entregue, liberada, aprovada"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Ação */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título da Tarefa</label>
              <input
                type="text"
                value={regra.acao.titulo}
                onChange={e => setRegra(prev => ({ 
                  ...prev, 
                  acao: { ...prev.acao, titulo: e.target.value }
                }))}
                placeholder="Ex: Follow-up — {cliente}"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Use {'{cliente}'} para nome do cliente</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={regra.acao.descricao}
                onChange={e => setRegra(prev => ({ 
                  ...prev, 
                  acao: { ...prev.acao, descricao: e.target.value }
                }))}
                rows={2}
                placeholder="Descreva o objetivo da tarefa"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={regra.acao.tipo}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    acao: { ...prev.acao, tipo: e.target.value as any }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  {TIPOS_TAREFA.map(t => (
                    <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <select
                  value={regra.acao.prioridade}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    acao: { ...prev.acao, prioridade: e.target.value as any }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prazo (dias)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={regra.acao.diasPrazo}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    acao: { ...prev.acao, diasPrazo: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Botões */}
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
            Salvar Regra
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfiguracaoTarefasView
