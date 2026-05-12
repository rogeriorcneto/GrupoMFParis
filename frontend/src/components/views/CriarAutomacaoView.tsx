import React, { useState, useEffect } from 'react'
import { 
  CogIcon, 
  PlusIcon, 
  TrashIcon, 
  PlayIcon, 
  PauseIcon,
  ClockIcon,
  BellIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ArrowPathIcon,
  FunnelIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  TagIcon,
  XMarkIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline'
import { 
  getAutomacoes, 
  createAutomacao, 
  updateAutomacao, 
  deleteAutomacao, 
  type Automacao 
} from '../../lib/database'
import { callAI, buildCRMContext } from '../../lib/gemini'

interface CriarAutomacaoViewProps {
  loggedUser: any
}

const CriarAutomacaoView: React.FC<CriarAutomacaoViewProps> = ({ loggedUser }) => {
  const isGerente = loggedUser?.cargo === 'gerente'
  const [automacoes, setAutomacoes] = useState<Automacao[]>([])
  const [mostrarEditor, setMostrarEditor] = useState(false)
  const [editando, setEditando] = useState<Automacao | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<'criar' | 'gerenciar'>('criar')
  
  // Estados do chat com IA
  const [mostrarChat, setMostrarChat] = useState(false)
  const [mensagensChat, setMensagensChat] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])
  const [inputChat, setInputChat] = useState('')
  const [carregandoChat, setCarregandoChat] = useState(false)

  // Estado do formulário
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    tipo: 'mensagem' as Automacao['tipo'],
    gatilhoTipo: 'tempo' as 'tempo' | 'evento' | 'manual',
    gatilhoConfig: {},
    acoes: [] as Array<{ tipo: string; configuracao: any; ordem: number }>
  })

  // Tipos de automação com descrições
  const tiposAutomacao = [
    {
      id: 'mensagem',
      nome: 'Mensagem Automática',
      descricao: 'Enviar mensagens automáticas para clientes',
      icon: ChatBubbleLeftRightIcon,
      cor: 'bg-blue-50 text-blue-600'
    },
    {
      id: 'tarefa',
      nome: 'Criação de Tarefas',
      descricao: 'Criar tarefas automaticamente para vendedores',
      icon: DocumentTextIcon,
      cor: 'bg-green-50 text-green-600'
    },
    {
      id: 'etapa',
      nome: 'Movimentação de Etapa',
      descricao: 'Mover clientes entre etapas do funil',
      icon: FunnelIcon,
      cor: 'bg-purple-50 text-purple-600'
    },
    {
      id: 'notificacao',
      nome: 'Notificação',
      descricao: 'Enviar notificações para a equipe',
      icon: BellIcon,
      cor: 'bg-yellow-50 text-yellow-600'
    },
    {
      id: 'email',
      nome: 'E-mail Marketing',
      descricao: 'Enviar e-mails marketing automáticos',
      icon: EnvelopeIcon,
      cor: 'bg-indigo-50 text-indigo-600'
    },
    {
      id: 'whatsapp',
      nome: 'WhatsApp',
      descricao: 'Enviar mensagens via WhatsApp',
      icon: ChatBubbleLeftRightIcon,
      cor: 'bg-emerald-50 text-emerald-600'
    }
  ]

  // Tipos de gatilhos
  const tiposGatilho = [
    {
      id: 'tempo',
      nome: 'Agendado',
      descricao: 'Executar em horários específicos',
      icon: ClockIcon
    },
    {
      id: 'evento',
      nome: 'Baseado em Evento',
      descricao: 'Executar quando algo acontecer',
      icon: SparklesIcon
    },
    {
      id: 'manual',
      nome: 'Manual',
      descricao: 'Executar apenas quando acionado',
      icon: PlayIcon
    }
  ]

  // Ações disponíveis
  const tiposAcoes = [
    {
      id: 'enviar_mensagem',
      nome: 'Enviar Mensagem',
      descricao: 'Enviar mensagem para cliente',
      campos: ['mensagem', 'destinatario']
    },
    {
      id: 'criar_tarefa',
      nome: 'Criar Tarefa',
      descricao: 'Criar tarefa para vendedor',
      campos: ['titulo', 'descricao', 'vendedor', 'prazo']
    },
    {
      id: 'mover_etapa',
      nome: 'Mover Etapa',
      descricao: 'Mover cliente para outra etapa',
      campos: ['etapa_destino', 'motivo']
    },
    {
      id: 'enviar_email',
      nome: 'Enviar E-mail',
      descricao: 'Enviar e-mail marketing',
      campos: ['assunto', 'corpo', 'destinatarios']
    },
    {
      id: 'enviar_whatsapp',
      nome: 'Enviar WhatsApp',
      descricao: 'Enviar mensagem via WhatsApp',
      campos: ['mensagem', 'numero']
    },
    {
      id: 'atualizar_score',
      nome: 'Atualizar Score',
      descricao: 'Atualizar score do cliente',
      campos: ['score', 'motivo']
    }
  ]

  // Carregar automações
  useEffect(() => {
    carregarAutomacoes()
  }, [])

  const carregarAutomacoes = async () => {
    setCarregando(true)
    try {
      const dados = await getAutomacoes()
      setAutomacoes(dados)
    } catch (error) {
      console.error('Erro ao carregar automações:', error)
    } finally {
      setCarregando(false)
    }
  }

  const adicionarAcao = () => {
    setFormData(prev => ({
      ...prev,
      acoes: [
        ...prev.acoes,
        {
          tipo: '',
          configuracao: {},
          ordem: prev.acoes.length + 1
        }
      ]
    }))
  }

  const removerAcao = (index: number) => {
    setFormData(prev => ({
      ...prev,
      acoes: prev.acoes.filter((_, i) => i !== index)
    }))
  }

  const atualizarAcao = (index: number, campo: string, valor: any) => {
    setFormData(prev => ({
      ...prev,
      acoes: prev.acoes.map((acao, i) => 
        i === index ? { ...acao, [campo]: valor } : acao
      )
    }))
  }

  const salvarAutomacao = async () => {
    if (!formData.nome.trim()) {
      alert('⚠️ Preencha o nome da automação')
      return
    }

    if (formData.acoes.length === 0) {
      alert('⚠️ Adicione pelo menos uma ação')
      return
    }

    setCarregando(true)

    try {
      let resultado: Automacao | null = null

      if (editando) {
        resultado = await updateAutomacao(editando.id, {
          nome: formData.nome,
          descricao: formData.descricao,
          tipo: formData.tipo,
          gatilhoTipo: formData.gatilhoTipo,
          gatilhoConfig: formData.gatilhoConfig,
          acoes: formData.acoes
        })
      } else {
        resultado = await createAutomacao(
          formData.nome,
          formData.descricao,
          formData.tipo,
          formData.gatilhoTipo,
          formData.gatilhoConfig,
          formData.acoes
        )
      }

      if (resultado) {
        await carregarAutomacoes()
        
        setFormData({
          nome: '',
          descricao: '',
          tipo: 'mensagem',
          gatilhoTipo: 'tempo',
          gatilhoConfig: {},
          acoes: []
        })

        setEditando(null)
        setMostrarEditor(false)
        
        alert(`✅ ${editando ? 'Automação atualizada' : 'Automação criada'} com sucesso no banco de dados!`)
      } else {
        alert('❌ Erro ao salvar automação no banco')
      }
    } catch (error) {
      console.error('Erro ao salvar automação:', error)
      alert('❌ Erro ao conectar com o banco de dados. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  const editarAutomacao = (automacao: Automacao) => {
    setEditando(automacao)
    setFormData({
      nome: automacao.nome,
      descricao: automacao.descricao || '',
      tipo: automacao.tipo,
      gatilhoTipo: automacao.gatilhoTipo,
      gatilhoConfig: automacao.gatilhoConfig,
      acoes: automacao.acoes
    })
    setMostrarEditor(true)
  }

  const alternarStatus = async (automacao: Automacao) => {
    const novoStatus = automacao.status === 'ativa' ? 'pausada' : 'ativa'
    
    try {
      const resultado = await updateAutomacao(automacao.id, { status: novoStatus })
      
      if (resultado) {
        setAutomacoes(prev => prev.map(a => 
          a.id === automacao.id ? { ...a, status: novoStatus } : a
        ))
      } else {
        alert('Erro ao atualizar status da automação')
      }
    } catch (error) {
      console.error('Erro ao alternar status:', error)
      alert('Erro ao atualizar status da automação')
    }
  }

  const excluirAutomacao = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta automação?')) return

    try {
      const sucesso = await deleteAutomacao(id)
      
      if (sucesso) {
        setAutomacoes(prev => prev.filter(a => a.id !== id))
        alert('Automação excluída com sucesso!')
      } else {
        alert('Erro ao excluir automação')
      }
    } catch (error) {
      console.error('Erro ao excluir automação:', error)
      alert('Erro ao excluir automação')
    }
  }

  // Funções do chat com IA
  const enviarMensagemChat = async () => {
    if (!inputChat.trim() || carregandoChat) return

    const mensagemUsuario = inputChat.trim()
    setInputChat('')
    
    setMensagensChat(prev => [...prev, { role: 'user', content: mensagemUsuario }])
    setCarregandoChat(true)

    try {
      const contextoAutomacoes = `
Contexto de Automações da MF Paris:

Automações Ativas:
${automacoes.map(a => `
- ${a.nome} (${a.tipo})
  Status: ${a.status}
  Gatilho: ${a.gatilhoTipo}
  Ações: ${a.acoes.length}
  Execuções: ${a.execucoes}
  Descrição: ${a.descricao || 'Sem descrição'}
`).join('\n')}

Tipos de Automação Disponíveis:
- mensagem: Enviar mensagens automáticas
- tarefa: Criar tarefas automaticamente
- etapa: Mover clientes entre etapas
- notificacao: Enviar notificações
- email: E-mails marketing
- whatsapp: Mensagens WhatsApp

Tipos de Gatilho:
- tempo: Agendado por horário
- evento: Baseado em eventos
- manual: Execução manual

Você é um assistente especialista em automações de vendas para a MF Paris. Ajude o gerente a entender, criar e otimizar automações.
`

      setMensagensChat(prev => [...prev, { role: 'assistant', content: '🤖 Processando sua pergunta...' }])

      const resposta = await callAI([{ role: 'user', content: mensagemUsuario }], contextoAutomacoes)
      
      setMensagensChat(prev => {
        const novas = [...prev]
        novas[novas.length - 1] = { role: 'assistant', content: resposta }
        return novas
      })
    } catch (error) {
      console.error('Erro ao enviar mensagem para IA:', error)
      setMensagensChat(prev => {
        const novas = [...prev]
        novas[novas.length - 1] = { role: 'assistant', content: '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.' }
        return novas
      })
    } finally {
      setCarregandoChat(false)
    }
  }

  const limparChat = () => {
    setMensagensChat([])
    setInputChat('')
  }

  const abrirChatComContexto = (automacao?: Automacao) => {
    setMostrarChat(true)
    
    if (automacao) {
      const mensagemContexto = `Olá! Preciso de ajuda com a automação "${automacao.nome}". Pode me explicar como ela funciona e dar sugestões de melhoria?`
      setMensagensChat([
        { role: 'user', content: mensagemContexto }
      ])
      setInputChat('')
    } else if (mensagensChat.length === 0) {
      setMensagensChat([
        { 
          role: 'assistant', 
          content: `👋 Olá! Sou o assistente de automações da MF Paris. Posso ajudar você a:

🔧 **Criar automações** - Explicar passo a passo como configurar
📊 **Analisar performance** - Avaliar suas automações atuais
💡 **Sugerir melhorias** - Otimizar processos existentes
❓ **Tirar dúvidas** - Esclarecer qualquer questão sobre automações

Como posso ajudar você hoje?` 
        }
      ])
    }
  }

  if (!isGerente) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Acesso Restrito</h3>
          <p className="text-gray-500">Apenas gerentes podem criar automações.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <CogIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Criação de Automações</h1>
              <p className="text-sm text-gray-500">Configure automações para otimizar processos de vendas</p>
            </div>
          </div>
          <button
            onClick={() => abrirChatComContexto()}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
            title="Converse com o assistente de automações"
          >
            <SparklesIcon className="h-5 w-5" />
            <span className="hidden sm:inline">Assistente IA</span>
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="bg-white rounded-apple border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setAbaAtiva('criar')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              abaAtiva === 'criar'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <PlusIcon className="h-5 w-5 inline mr-2" />
            Criar Automação
          </button>
          <button
            onClick={() => setAbaAtiva('gerenciar')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              abaAtiva === 'gerenciar'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CogIcon className="h-5 w-5 inline mr-2" />
            Gerenciar ({automacoes.length})
          </button>
        </div>

        {/* Conteúdo da Aba Criar */}
        {abaAtiva === 'criar' && (
          <div className="p-6">
            {!mostrarEditor ? (
              <div>
                {/* Tipos de Automação */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Escolha o tipo de automação</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tiposAutomacao.map(tipo => (
                      <button
                        key={tipo.id}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, tipo: tipo.id as Automacao['tipo'] }))
                          setMostrarEditor(true)
                        }}
                        className="p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                      >
                        <div className={`inline-flex p-2 rounded-lg mb-3 ${tipo.cor}`}>
                          <tipo.icon className="h-6 w-6" />
                        </div>
                        <h4 className="font-medium text-gray-900 mb-1">{tipo.nome}</h4>
                        <p className="text-sm text-gray-600">{tipo.descricao}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Editor de Automação */
              <div className="space-y-6">
                {/* Indicador de Salvamento */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                  <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">Salvamento Automático no Banco de Dados</p>
                    <p className="text-xs text-blue-700">Esta automação será salva no Supabase e estará disponível para toda a equipe.</p>
                  </div>
                </div>

              {/* Informações Básicas */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Informações Básicas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nome da Automação *
                      </label>
                      <input
                        type="text"
                        value={formData.nome}
                        onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ex: Boas-vindas Novos Clientes"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo
                      </label>
                      <select
                        value={formData.tipo}
                        onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value as Automacao['tipo'] }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {tiposAutomacao.map(tipo => (
                          <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={formData.descricao}
                      onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Descreva como esta automação funciona..."
                    />
                  </div>
                </div>

                {/* Gatilho */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Gatilho</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {tiposGatilho.map(tipo => (
                      <button
                        key={tipo.id}
                        onClick={() => setFormData(prev => ({ ...prev, gatilhoTipo: tipo.id as any }))}
                        className={`p-4 border rounded-lg transition-all text-left ${
                          formData.gatilhoTipo === tipo.id
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <tipo.icon className="h-6 w-6 text-gray-600 mb-2" />
                        <h4 className="font-medium text-gray-900">{tipo.nome}</h4>
                        <p className="text-sm text-gray-600 mt-1">{tipo.descricao}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ações */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Ações</h3>
                    <button
                      onClick={adicionarAcao}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Adicionar Ação
                    </button>
                  </div>

                  {formData.acoes.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                      <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-500">Nenhuma ação adicionada</p>
                      <p className="text-sm text-gray-400 mt-1">Adicione ações para definir o que esta automação fará</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.acoes.map((acao, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center justify-center w-6 h-6 bg-indigo-100 text-indigo-600 text-sm font-medium rounded-full">
                                {index + 1}
                              </span>
                              <h4 className="font-medium text-gray-900">Ação {index + 1}</h4>
                            </div>
                            <button
                              onClick={() => removerAcao(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Tipo de Ação
                              </label>
                              <select
                                value={acao.tipo}
                                onChange={(e) => atualizarAcao(index, 'tipo', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="">Selecione...</option>
                                {tiposAcoes.map(tipo => (
                                  <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                                ))}
                              </select>
                            </div>

                            {acao.tipo === 'enviar_mensagem' && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Mensagem
                                </label>
                                <textarea
                                  value={acao.configuracao.mensagem || ''}
                                  onChange={(e) => atualizarAcao(index, 'configuracao', { ...acao.configuracao, mensagem: e.target.value })}
                                  rows={2}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  placeholder="Digite a mensagem..."
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botões de Ação */}
                <div className="flex justify-between gap-3 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      if (formData.nome.trim() || formData.descricao.trim() || formData.acoes.length > 0) {
                        if (confirm('Tem certeza que deseja sair sem salvar? Todas as alterações serão perdidas.')) {
                          setMostrarEditor(false)
                          setEditando(null)
                          setFormData({
                            nome: '',
                            descricao: '',
                            tipo: 'mensagem',
                            gatilhoTipo: 'tempo',
                            gatilhoConfig: {},
                            acoes: []
                          })
                        }
                      } else {
                        setMostrarEditor(false)
                        setEditando(null)
                        setFormData({
                          nome: '',
                          descricao: '',
                          tipo: 'mensagem',
                          gatilhoTipo: 'tempo',
                          gatilhoConfig: {},
                          acoes: []
                        })
                      }
                    }}
                    className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Sair sem Salvar
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setMostrarEditor(false)
                        setEditando(null)
                        setFormData({
                          nome: '',
                          descricao: '',
                          tipo: 'mensagem',
                          gatilhoTipo: 'tempo',
                          gatilhoConfig: {},
                          acoes: []
                        })
                      }}
                      className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={salvarAutomacao}
                      disabled={carregando}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {carregando ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          Salvando...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
                          </svg>
                          {editando ? 'Atualizar' : 'Salvar'} Automação
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conteúdo da Aba Gerenciar */}
        {abaAtiva === 'gerenciar' && (
          <div className="p-6">
            {carregando ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Carregando automações...</p>
              </div>
            ) : automacoes.length === 0 ? (
              <div className="text-center py-8">
                <CogIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma automação criada</h3>
                <p className="text-gray-500">Crie sua primeira automação para começar a otimizar processos.</p>
                <button
                  onClick={() => setAbaAtiva('criar')}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Criar Primeira Automação
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {automacoes.map(automacao => {
                  const tipoInfo = tiposAutomacao.find(t => t.id === automacao.tipo)
                  return (
                    <div key={automacao.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-lg ${tipoInfo?.cor || 'bg-gray-50 text-gray-600'}`}>
                            {tipoInfo?.icon ? <tipoInfo.icon className="h-5 w-5" /> : <CogIcon className="h-5 w-5" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-900">{automacao.nome}</h4>
                              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                                automacao.status === 'ativa' ? 'bg-green-100 text-green-700' :
                                automacao.status === 'pausada' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {automacao.status === 'ativa' && <PlayIcon className="h-3 w-3 mr-1" />}
                                {automacao.status === 'pausada' && <PauseIcon className="h-3 w-3 mr-1" />}
                                {automacao.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{automacao.descricao}</p>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>{automacao.acoes.length} ação(ões)</span>
                              <span>{automacao.execucoes} execuções</span>
                              {automacao.ultimaExecucao && (
                                <span>Última: {new Date(automacao.ultimaExecucao).toLocaleDateString('pt-BR')}</span>
                              )}
                              <span>Criado: {new Date(automacao.criadoEm).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => abrirChatComContexto(automacao)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Pedir ajuda à IA"
                          >
                            <SparklesIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => alternarStatus(automacao)}
                            className={`p-2 rounded-lg transition-colors ${
                              automacao.status === 'ativa' 
                                ? 'text-yellow-600 hover:bg-yellow-50' 
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={automacao.status === 'ativa' ? 'Pausar' : 'Ativar'}
                          >
                            {automacao.status === 'ativa' ? (
                              <PauseIcon className="h-4 w-4" />
                            ) : (
                              <PlayIcon className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => editarAutomacao(automacao)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <ArrowPathIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => excluirAutomacao(automacao.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat com IA */}
      {mostrarChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMostrarChat(false)} />
          <div className="relative bg-white rounded-apple shadow-apple-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header do Chat */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg">
                  <SparklesIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Assistente de Automações</h3>
                  <p className="text-xs text-gray-500">IA especialista em automações de vendas</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={limparChat}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Limpar conversa"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setMostrarChat(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Fechar"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {mensagensChat.length === 0 ? (
                <div className="text-center py-8">
                  <SparklesIcon className="h-12 w-12 text-purple-500 mx-auto mb-4" />
                  <h4 className="font-medium text-gray-900 mb-2">Como posso ajudar?</h4>
                  <p className="text-sm text-gray-500">Pergunte sobre automações, configurações, melhores práticas ou tire dúvidas sobre suas automações existentes.</p>
                </div>
              ) : (
                mensagensChat.map((mensagem, index) => (
                  <div
                    key={index}
                    className={`flex ${mensagem.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        mensagem.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {mensagem.content}
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              {carregandoChat && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-indigo-600"></div>
                      <span className="text-sm text-gray-600">Pensando...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && enviarMensagemChat()}
                  placeholder="Digite sua pergunta sobre automações..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  disabled={carregandoChat}
                />
                <button
                  onClick={enviarMensagemChat}
                  disabled={carregandoChat || !inputChat.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                </button>
              </div>
              
              {/* Sugestões rápidas */}
              {mensagensChat.length <= 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => setInputChat('Como criar uma automação de boas-vindas?')}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    Como criar automação?
                  </button>
                  <button
                    onClick={() => setInputChat('Quais são as melhores práticas para automações?')}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    Melhores práticas
                  </button>
                  <button
                    onClick={() => setInputChat('Como otimizar minhas automações existentes?')}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    Otimizar automações
                  </button>
                  <button
                    onClick={() => setInputChat('Explique os tipos de gatilhos disponíveis')}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    Tipos de gatilhos
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CriarAutomacaoView
