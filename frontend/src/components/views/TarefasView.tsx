import React from 'react'
import { XMarkIcon, PlusIcon, SparklesIcon } from '@heroicons/react/24/outline'
import type { Tarefa, Cliente, Vendedor } from '../../types'

const TarefasView: React.FC<{
  tarefas: Tarefa[]
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onUpdateTarefa: (t: Tarefa) => void
  onAddTarefa: (t: Tarefa) => void
}> = ({ tarefas, clientes, vendedores, loggedUser, onUpdateTarefa, onAddTarefa }) => {
  const [showModal, setShowModal] = React.useState(false)
  const [filterStatus, setFilterStatus] = React.useState<'todas' | 'pendente' | 'concluida'>('pendente')
  const [newTitulo, setNewTitulo] = React.useState('')
  const [newDescricao, setNewDescricao] = React.useState('')
  const [newData, setNewData] = React.useState(new Date().toISOString().split('T')[0])
  const [newHora, setNewHora] = React.useState('')
  const [newTipo, setNewTipo] = React.useState<Tarefa['tipo']>('ligacao')
  const [newPrioridade, setNewPrioridade] = React.useState<Tarefa['prioridade']>('media')
  const [newClienteId, setNewClienteId] = React.useState<number | ''>(clientes[0]?.id ?? '')
  const [newVendedorId, setNewVendedorId] = React.useState<number | ''>(loggedUser?.id ?? '')
  const isGerente = loggedUser?.cargo === 'gerente'

  const hoje = new Date().toISOString().split('T')[0]

  const filteredTarefas = tarefas.filter(t => {
    const matchStatus = filterStatus === 'todas' || t.status === filterStatus
    const matchVendedor = isGerente ? true : (!t.vendedorId || t.vendedorId === loggedUser?.id)
    return matchStatus && matchVendedor
  })

  const tarefasPorData = filteredTarefas.reduce((acc, t) => {
    if (!acc[t.data]) acc[t.data] = []
    acc[t.data].push(t)
    return acc
  }, {} as Record<string, Tarefa[]>)

  const datasOrdenadas = Object.keys(tarefasPorData).sort()

  const handleAddTarefa = () => {
    if (!newTitulo.trim()) return
    onAddTarefa({
      id: Date.now(),
      titulo: newTitulo.trim(),
      descricao: newDescricao.trim() || undefined,
      data: newData,
      hora: newHora.trim() || undefined,
      tipo: newTipo,
      status: 'pendente',
      prioridade: newPrioridade,
      clienteId: typeof newClienteId === 'number' ? newClienteId : undefined,
      vendedorId: typeof newVendedorId === 'number' ? newVendedorId : undefined
    })
    setNewTitulo('')
    setNewDescricao('')
    setNewHora('')
    setNewVendedorId(loggedUser?.id ?? '')
    setShowModal(false)
  }

  const toggleStatus = (tarefa: Tarefa) => {
    onUpdateTarefa({ ...tarefa, status: tarefa.status === 'pendente' ? 'concluida' : 'pendente' })
  }

  const getTipoIcon = (tipo: Tarefa['tipo']) => {
    switch (tipo) {
      case 'ligacao': return '📞'
      case 'reuniao': return '🤝'
      case 'email': return '📧'
      case 'whatsapp': return '💬'
      case 'follow-up': return '🔄'
      default: return '📋'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Tarefas e Agenda</h1>
          <p className="mt-1 text-sm text-gray-600">Organize suas atividades e nunca perca um follow-up</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              const sugeridas: Tarefa[] = [
                { id: Date.now() + 1, clienteId: clientes.find(c => c.diasInativo && c.diasInativo > 7)?.id, titulo: 'Follow-up com leads inativos', descricao: 'Entrar em contato com clientes sem interação há mais de 7 dias', data: hoje, hora: '10:00', tipo: 'ligacao', status: 'pendente', prioridade: 'alta' },
                { id: Date.now() + 2, clienteId: clientes.find(c => c.etapa === 'negociacao')?.id, titulo: 'Enviar proposta comercial', descricao: 'Preparar e enviar proposta para leads em negociação', data: hoje, hora: '14:00', tipo: 'email', status: 'pendente', prioridade: 'alta' },
                { id: Date.now() + 3, titulo: 'Revisar pipeline de vendas', descricao: 'Analisar funil e identificar gargalos', data: amanha, hora: '09:00', tipo: 'outro', status: 'pendente', prioridade: 'media' },
                { id: Date.now() + 4, clienteId: clientes.find(c => c.etapa === 'amostra')?.id, titulo: 'Agendar reunião de apresentação', descricao: 'Marcar reunião para apresentar produtos', data: amanha, hora: '15:00', tipo: 'reuniao', status: 'pendente', prioridade: 'media' },
                { id: Date.now() + 5, titulo: 'Atualizar CRM e registros', descricao: 'Revisar e atualizar informações de clientes', data: amanha, tipo: 'outro', status: 'pendente', prioridade: 'baixa' }
              ]
              sugeridas.forEach(t => onAddTarefa(t))
              alert(`✨ IA adicionou ${sugeridas.length} tarefas sugeridas!`)
            }}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-apple hover:from-purple-700 hover:to-blue-700 shadow-apple-sm flex items-center"
          >
            <SparklesIcon className="h-4 w-4 mr-2" />
            IA Sugerir Tarefas
          </button>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm flex items-center">
            <PlusIcon className="h-4 w-4 mr-2" />
            Nova Tarefa
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="todas">Todas</option>
          <option value="pendente">Pendentes</option>
          <option value="concluida">Concluídas</option>
        </select>
      </div>

      <div className="space-y-6">
        {datasOrdenadas.length === 0 && (
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhuma tarefa encontrada</p>
          </div>
        )}
        {datasOrdenadas.map(data => {
          const tarefasDia = tarefasPorData[data].sort((a, b) => {
            if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
            if (a.hora) return -1
            if (b.hora) return 1
            return 0
          })
          const isHoje = data === hoje
          return (
            <div key={data} className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
              <div className={`px-6 py-4 border-b border-gray-200 ${isHoje ? 'bg-primary-50' : ''}`}>
                <h3 className={`text-lg font-semibold ${isHoje ? 'text-primary-700' : 'text-gray-900'}`}>
                  {isHoje ? '🔥 Hoje' : new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{tarefasDia.length} tarefa(s)</p>
              </div>
              <div className="p-6 space-y-3">
                {tarefasDia.map(tarefa => {
                  const cliente = clientes.find(c => c.id === tarefa.clienteId)
                  const vendedor = vendedores.find(v => v.id === tarefa.vendedorId)
                  return (
                    <div key={tarefa.id} className={`p-4 rounded-apple border-2 transition-all ${tarefa.status === 'concluida' ? 'bg-gray-50 border-gray-200 opacity-60' : tarefa.prioridade === 'alta' ? 'bg-red-50 border-red-200' : tarefa.prioridade === 'media' ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-start gap-4">
                        <button onClick={() => toggleStatus(tarefa)} className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${tarefa.status === 'concluida' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary-500'}`}>
                          {tarefa.status === 'concluida' && <span className="text-white text-xs">✓</span>}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getTipoIcon(tarefa.tipo)}</span>
                                <h4 className={`font-semibold text-gray-900 ${tarefa.status === 'concluida' ? 'line-through' : ''}`}>{tarefa.titulo}</h4>
                              </div>
                              {tarefa.descricao && <p className="text-sm text-gray-600 mt-1">{tarefa.descricao}</p>}
                              <div className="flex items-center gap-3 mt-2">
                                {cliente && <p className="text-xs text-gray-500">👤 {cliente.razaoSocial}</p>}
                                {vendedor && <p className="text-xs text-primary-600 font-medium">🏷️ {vendedor.nome}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              {tarefa.hora && <p className="text-sm font-semibold text-gray-900">🕐 {tarefa.hora}</p>}
                              <span className={`inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full ${tarefa.prioridade === 'alta' ? 'bg-red-100 text-red-700' : tarefa.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{tarefa.prioridade}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-apple shadow-apple-lg max-w-2xl w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Nova Tarefa</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-6 w-6" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input value={newTitulo} onChange={(e) => setNewTitulo(e.target.value)} placeholder="Ex: Ligar para cliente" className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)} rows={2} placeholder="Detalhes..." className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input type="date" value={newData} onChange={(e) => setNewData(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input type="time" value={newHora} onChange={(e) => setNewHora(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={newTipo} onChange={(e) => setNewTipo(e.target.value as Tarefa['tipo'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="ligacao">📞 Ligação</option>
                    <option value="reuniao">🤝 Reunião</option>
                    <option value="email">📧 Email</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="follow-up">🔄 Follow-up</option>
                    <option value="outro">📋 Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                  <select value={newPrioridade} onChange={(e) => setNewPrioridade(e.target.value as Tarefa['prioridade'])} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (opcional)</label>
                  <select value={newClienteId} onChange={(e) => setNewClienteId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Sem cliente</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsável *</label>
                  <select value={newVendedorId} onChange={(e) => setNewVendedorId(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Todos (sem filtro)</option>
                    {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome} {v.cargo === 'gerente' ? '(Gerente)' : ''}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded-apple hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAddTarefa} disabled={!newTitulo.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm">Criar Tarefa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TarefasView
