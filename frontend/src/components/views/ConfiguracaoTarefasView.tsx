import React, { useState, useEffect } from 'react'
import { PlusIcon, PlayIcon, PauseIcon, PencilIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import * as db from '../../lib/database'
import type { Vendedor } from '../../types'

// Componente de seleção de tarefas
interface TarefaSelectorProps {
  tarefas: Array<{id: string, titulo: string}>
  carregando: boolean
  tarefaSelecionadaId?: number
  tarefaSelecionadaNome?: string
  onTarefaSelecionada: (tarefa: {id: number, titulo: string} | null) => void
  onLimparSelecao: () => void
}

const TarefaSelector: React.FC<TarefaSelectorProps> = ({
  tarefas,
  carregando,
  tarefaSelecionadaId,
  tarefaSelecionadaNome,
  onTarefaSelecionada,
  onLimparSelecao
}) => {
  const [busca, setBusca] = useState('')
  const [mostrarLista, setMostrarLista] = useState(false)

  const tarefasFiltradas = tarefas.filter(t => 
    t.titulo.toLowerCase().includes(busca.toLowerCase())
  )

  const selecionarTarefa = (tarefa: {id: string, titulo: string}) => {
    onTarefaSelecionada({
      id: parseInt(tarefa.id),
      titulo: tarefa.titulo
    })
    setBusca('')
    setMostrarLista(false)
  }

  return (
    <div className="relative">
      {/* Campo de busca/seleção */}
      <div className="relative">
        {tarefaSelecionadaId ? (
          // Tarefa selecionada
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckIcon className="h-5 w-5 text-green-600" />
            <span className="flex-1 text-sm font-medium text-green-800">
              {tarefaSelecionadaNome}
            </span>
            <button
              onClick={onLimparSelecao}
              className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
              title="Limpar seleção"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          // Campo de busca
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setMostrarLista(true)
              }}
              onFocus={() => setMostrarLista(true)}
              placeholder="Buscar tarefa existente..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lista de resultados */}
      {mostrarLista && !tarefaSelecionadaId && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {carregando ? (
            <div className="p-3 text-center text-gray-500 text-sm">
              Carregando tarefas...
            </div>
          ) : tarefasFiltradas.length === 0 ? (
            <div className="p-3 text-center text-gray-500 text-sm">
              {busca ? 'Nenhuma tarefa encontrada' : 'Nenhuma tarefa disponível'}
            </div>
          ) : (
            <div className="py-1">
              {tarefasFiltradas.map(tarefa => (
                <button
                  key={tarefa.id}
                  onClick={() => selecionarTarefa(tarefa)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{tarefa.titulo}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fechar lista ao clicar fora */}
      {mostrarLista && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setMostrarLista(false)}
        />
      )}
    </div>
  )
}

// Interface para regras de automação
interface RegraAutomacao {
  id?: number
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
    tarefaEspecificaId?: number // ID da tarefa específica existente no CRM
    etapaCliente?: string
  }
  acao: {
    titulo: string
    descricao: string
    tipo: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'outro'
    prioridade: 'alta' | 'media' | 'baixa'
    diasPrazo: number
    horaPadrao?: string
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
      diasPrazo: 40
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
      diasPrazo: 7
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
      diasPrazo: 30
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
      descricao: 'Cliente satisfeito. Preparar proposta para próximo ciclo de compras.',
      tipo: 'reuniao',
      prioridade: 'media',
      diasPrazo: 60
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
  { key: 'perdido', label: 'Perdido' },
  { key: 'homologado', label: 'Homologado' },
  { key: 'pos_venda', label: 'Pós-venda' },
  { key: 'follow_up', label: 'Follow-up' }
]

// Gatilhos disponíveis
const GATILHOS = [
  { key: 'mudanca_etapa', label: 'Mudança de Etapa no Funil' },
  { key: 'inatividade', label: 'Inatividade do Cliente' },
  { key: 'substatus', label: 'Mudança de Sub-status' },
  { key: 'data_especifica', label: 'Data Específica' },
  { key: 'reconquista', label: 'Reconquista de Cliente Perdido' },
  { key: 'tarefa_concluida', label: 'Tarefa Concluída' }
]

// Tipos de tarefas
const TIPOS_TAREFA = [
  { key: 'ligacao', label: 'Ligação', icon: '📞' },
  { key: 'email', label: 'E-mail', icon: '📧' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'reuniao', label: 'Reunião', icon: '🤝' },
  { key: 'follow-up', label: 'Follow-up', icon: '🔄' },
  { key: 'outro', label: 'Outro', icon: '📌' }
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
  const [tarefasExistentes, setTarefasExistentes] = useState<Array<{id: string, titulo: string}>>([])
  const [carregandoTarefas, setCarregandoTarefas] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carregar tarefas existentes do CRM
  const carregarTarefasExistentes = async () => {
    try {
      setCarregandoTarefas(true)
      const tarefas = await db.fetchTarefas()
      // Extrair títulos únicos das tarefas
      const titulosUnicos = Array.from(new Set(tarefas.map(t => t.titulo)))
        .map(titulo => ({
          id: titulo,
          titulo
        }))
        .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''))
      setTarefasExistentes(titulosUnicos)
    } catch (err) {
      console.error('Erro ao carregar tarefas existentes:', err)
    } finally {
      setCarregandoTarefas(false)
    }
  }

  // Carregar tarefas e regras do banco
  useEffect(() => {
    carregarTarefasExistentes()
    
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
        setError('Falha ao carregar regras de automação')
      } finally {
        setLoading(false)
      }
    }

    carregarRegras()
  }, [])

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

  const toggleRegra = async (id: number) => {
    const regra = regras.find(r => r.id === id)
    if (!regra) return
    
    try {
      await db.updateRegraAutomacao(id, { ativa: !regra.ativa })
      setRegras(prev => prev.map(r => 
        r.id === id ? { ...r, ativa: !r.ativa } : r
      ))
    } catch (err) {
      console.error('Erro ao ativar/desativar regra:', err)
    }
  }

  const deleteRegra = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return
    
    try {
      await db.deleteRegraAutomacao(id)
      setRegras(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error('Erro ao excluir regra:', err)
    }
  }

  const saveRegra = async (regra: RegraAutomacao) => {
    try {
      if (regra.id === 0) {
        // Nova regra
        const nova = await db.insertRegraAutomacao(regra)
        setRegras(prev => [...prev, nova])
        setNovaRegra(null)
      } else {
        // Editar regra
        await db.updateRegraAutomacao(regra.id, regra)
        setRegras(prev => prev.map(r => r.id === regra.id ? regra : r))
        setEditando(null)
      }
    } catch (err) {
      console.error('Erro ao salvar regra:', err)
      alert('Erro ao salvar regra. Tente novamente.')
    }
  }

  const regrasFiltradas = filtroGatilho === 'todos' 
    ? regras 
    : regras.filter(r => r.gatilho === filtroGatilho)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Carregando regras de automação...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Automação de Tarefas</h1>
            <p className="text-gray-600 mt-1">Configure regras para criar tarefas automaticamente</p>
          </div>
          <button
            onClick={startNovaRegra}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Nova Regra
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filtrar por gatilho:</label>
          <select
            value={filtroGatilho}
            onChange={e => setFiltroGatilho(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos</option>
            {GATILHOS.map(gatilho => (
              <option key={gatilho.key} value={gatilho.key}>
                {gatilho.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Regras */}
      <div className="space-y-4">
        {/* Nova Regra Form */}
        {novaRegra && (
          <RegraForm
            regra={novaRegra}
            onSave={saveRegra}
            onCancel={() => setNovaRegra(null)}
            isNova={true}
            tarefasExistentes={tarefasExistentes}
            carregandoTarefas={carregandoTarefas}
          />
        )}

        {/* Regras existentes */}
        {regrasFiltradas.map(regra => (
          <div key={regra.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`font-semibold ${regra.ativa ? 'text-gray-900' : 'text-gray-500'}`}>
                      {regra.nome}
                    </h3>
                    {!regra.ativa && (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                        Inativa
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-3">
                    <span className="font-medium">Gatilho:</span> {GATILHOS.find(g => g.key === regra.gatilho)?.label}
                    {regra.condicoes.tarefaEspecifica && (
                      <span className="ml-2">
                        • Tarefa: "{regra.condicoes.tarefaEspecifica}"
                        {regra.condicoes.tarefaEspecificaId && (
                          <span className="text-purple-600 font-medium"> (ID: {regra.condicoes.tarefaEspecificaId})</span>
                        )}
                      </span>
                    )}
                    {regra.condicoes.etapaDestino && (
                      <span className="ml-2">• Etapa: {ETAPAS.find(e => e.key === regra.condicoes.etapaDestino)?.label}</span>
                    )}
                  </div>

                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Ação:</span> Criar tarefa "{regra.acao.titulo}" 
                    <span className="ml-2">({regra.acao.diasPrazo} dias{regra.acao.horaPadrao ? ` às ${regra.acao.horaPadrao}` : ''})</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleRegra(regra.id!)}
                    className={`p-2 rounded-lg transition-colors ${
                      regra.ativa 
                        ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={regra.ativa ? 'Desativar' : 'Ativar'}
                  >
                    {regra.ativa ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                  </button>
                  
                  <button
                    onClick={() => setEditando(regra.id!)}
                    className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    title="Editar"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  
                  <button
                    onClick={() => deleteRegra(regra.id!)}
                    className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    title="Excluir"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                  
                  <button
                    onClick={() => toggleExpand(regra.id!)}
                    className="p-2 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Expandir"
                  >
                    {expandedRegras.has(regra.id!) ? 
                      <ChevronUpIcon className="h-4 w-4" /> : 
                      <ChevronDownIcon className="h-4 w-4" />
                    }
                  </button>
                </div>
              </div>

              {/* Detalhes expandidos */}
              {expandedRegras.has(regra.id!) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Condições</h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        {regra.condicoes.etapaOrigem && (
                          <div>• Etapa origem: {ETAPAS.find(e => e.key === regra.condicoes.etapaOrigem)?.label}</div>
                        )}
                        {regra.condicoes.etapaDestino && (
                          <div>• Etapa destino: {ETAPAS.find(e => e.key === regra.condicoes.etapaDestino)?.label}</div>
                        )}
                        {regra.condicoes.diasInatividade && (
                          <div>• Dias inatividade: {regra.condicoes.diasInatividade}</div>
                        )}
                        {regra.condicoes.subStatus && (
                          <div>• Sub-status: {regra.condicoes.subStatus}</div>
                        )}
                        {regra.condicoes.tipoTarefaConcluida && regra.condicoes.tipoTarefaConcluida !== 'qualquer' && (
                          <div>• Tipo tarefa: {TIPOS_TAREFA.find(t => t.key === regra.condicoes.tipoTarefaConcluida)?.label}</div>
                        )}
                        {regra.condicoes.etapaCliente && (
                          <div>• Etapa cliente: {ETAPAS.find(e => e.key === regra.condicoes.etapaCliente)?.label}</div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Ação</h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>• Título: {regra.acao.titulo}</div>
                        <div>• Descrição: {regra.acao.descricao}</div>
                        <div>• Tipo: {TIPOS_TAREFA.find(t => t.key === regra.acao.tipo)?.label}</div>
                        <div>• Prioridade: {regra.acao.prioridade}</div>
                        <div>• Prazo: {regra.acao.diasPrazo} dias{regra.acao.horaPadrao ? ` às ${regra.acao.horaPadrao}` : ''}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {regrasFiltradas.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">Nenhuma regra encontrada</div>
          <button
            onClick={startNovaRegra}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Criar Primeira Regra
          </button>
        </div>
      )}
    </div>
  )
}

// Componente de formulário para criar/editar regra
interface RegraFormProps {
  regra: RegraAutomacao
  onSave: (regra: RegraAutomacao) => void
  onCancel: () => void
  isNova: boolean
  tarefasExistentes: Array<{id: string, titulo: string}>
  carregandoTarefas: boolean
}

const RegraForm: React.FC<RegraFormProps> = ({ 
  regra: initialRegra, 
  onSave, 
  onCancel, 
  isNova, 
  tarefasExistentes, 
  carregandoTarefas 
}) => {
  const [regra, setRegra] = useState(initialRegra)

  const handleSave = () => {
    if (!regra.nome || !regra.acao.titulo) {
      alert('Preencha o nome da regra e o título da tarefa')
      return
    }
    onSave(regra)
  }

  return (
    <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
      <div className="p-4 bg-blue-50 border-b border-blue-200">
        <h3 className="font-semibold text-blue-900">
          {isNova ? 'Nova Regra de Automação' : 'Editar Regra'}
        </h3>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Nome da regra */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Regra</label>
          <input
            type="text"
            value={regra.nome}
            onChange={e => setRegra(prev => ({ ...prev, nome: e.target.value }))}
            placeholder="Ex: Follow-up após amostra"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Gatilho */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gatilho</label>
          <select
            value={regra.gatilho}
            onChange={e => setRegra(prev => ({ 
              ...prev, 
              gatilho: e.target.value as RegraAutomacao['gatilho'],
              condicoes: {} // Reset condições ao mudar gatilho
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GATILHOS.map(gatilho => (
              <option key={gatilho.key} value={gatilho.key}>
                {gatilho.label}
              </option>
            ))}
          </select>
        </div>

        {/* Condições baseadas no gatilho */}
        {regra.gatilho === 'mudanca_etapa' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etapa Origem (opcional)</label>
              <select
                value={regra.condicoes.etapaOrigem || ''}
                onChange={e => setRegra(prev => ({ 
                  ...prev, 
                  condicoes: { ...prev.condicoes, etapaOrigem: e.target.value || undefined }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Qualquer etapa</option>
                {ETAPAS.map(etapa => (
                  <option key={etapa.key} value={etapa.key}>
                    {etapa.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etapa Destino</label>
              <select
                value={regra.condicoes.etapaDestino || ''}
                onChange={e => setRegra(prev => ({ 
                  ...prev, 
                  condicoes: { ...prev.condicoes, etapaDestino: e.target.value || undefined }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {ETAPAS.map(etapa => (
                  <option key={etapa.key} value={etapa.key}>
                    {etapa.label}
                  </option>
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
              value={regra.condicoes.diasInatividade || ''}
              onChange={e => setRegra(prev => ({ 
                ...prev, 
                condicoes: { ...prev.condicoes, diasInatividade: parseInt(e.target.value) }
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {regra.gatilho === 'tarefa_concluida' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarefa Específica (opcional)</label>
              <TarefaSelector
                tarefas={tarefasExistentes}
                carregando={carregandoTarefas}
                tarefaSelecionadaId={regra.condicoes.tarefaEspecificaId}
                tarefaSelecionadaNome={regra.condicoes.tarefaEspecifica}
                onTarefaSelecionada={(tarefa) => {
                  setRegra(prev => ({ 
                    ...prev, 
                    condicoes: { 
                      ...prev.condicoes, 
                      tarefaEspecificaId: tarefa?.id,
                      tarefaEspecifica: tarefa?.titulo || undefined
                    }
                  }))
                }}
                onLimparSelecao={() => {
                  setRegra(prev => ({ 
                    ...prev, 
                    condicoes: { 
                      ...prev.condicoes, 
                      tarefaEspecificaId: undefined,
                      tarefaEspecifica: undefined
                    }
                  }))
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                {carregandoTarefas ? 'Carregando tarefas...' : 'Disparar apenas quando esta tarefa específica for concluída (exato)'}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Tarefa</label>
                <select
                  value={regra.condicoes.tipoTarefaConcluida || 'qualquer'}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    condicoes: { ...prev.condicoes, tipoTarefaConcluida: e.target.value as any }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="qualquer">Qualquer tipo</option>
                  {TIPOS_TAREFA.map(tipo => (
                    <option key={tipo.key} value={tipo.key}>
                      {tipo.icon} {tipo.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etapa do Cliente</label>
                <select
                  value={regra.condicoes.etapaCliente || ''}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    condicoes: { ...prev.condicoes, etapaCliente: e.target.value || undefined }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Qualquer etapa</option>
                  {ETAPAS.map(etapa => (
                    <option key={etapa.key} value={etapa.key}>
                      {etapa.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Ação */}
        <div className="border-t pt-4">
          <h4 className="font-medium text-gray-900 mb-3">Ação (Tarefa a ser criada)</h4>
          
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Use {'{cliente}'} para incluir o nome do cliente</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={regra.acao.descricao}
                onChange={e => setRegra(prev => ({ 
                  ...prev, 
                  acao: { ...prev.acao, descricao: e.target.value }
                }))}
                rows={3}
                placeholder="Descreva o objetivo da tarefa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={regra.acao.tipo}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    acao: { ...prev.acao, tipo: e.target.value as any }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TIPOS_TAREFA.map(tipo => (
                    <option key={tipo.key} value={tipo.key}>
                      {tipo.icon} {tipo.label}
                    </option>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário (opcional)</label>
                <input
                  type="time"
                  value={regra.acao.horaPadrao || ''}
                  onChange={e => setRegra(prev => ({ 
                    ...prev, 
                    acao: { ...prev.acao, horaPadrao: e.target.value || undefined }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isNova ? 'Criar Regra' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfiguracaoTarefasView
