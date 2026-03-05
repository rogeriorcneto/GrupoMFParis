import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { Cliente, Interacao, Tarefa, Vendedor } from '../types'
import * as db from '../lib/database'
import { logger } from '../utils/logger'

interface ClientePanelProps {
  cliente: Cliente
  interacoes: Interacao[]
  tarefas: Tarefa[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  onClose: () => void
  onEditCliente: (c: Cliente) => void
  onMoverCliente: (id: number, toStage: string, extras?: Partial<Cliente>) => void
  onTriggerAmostra: (cliente: Cliente) => void
  onTriggerNegociacao: (cliente: Cliente) => void
  onTriggerPerda: (cliente: Cliente) => void
  setInteracoes: React.Dispatch<React.SetStateAction<Interacao[]>>
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  setTarefas: React.Dispatch<React.SetStateAction<Tarefa[]>>
  addNotificacao: (tipo: 'info' | 'warning' | 'error' | 'success', titulo: string, mensagem: string, clienteId?: number) => void
}

const etapaLabels: Record<string, string> = { 'prospecção': 'Prospecção', 'amostra': 'Amostra', 'homologado': 'Homologado', 'negociacao': 'Negociação', 'pos_venda': 'Pós-Venda', 'perdido': 'Perdido' }
const etapaCores: Record<string, string> = { 'prospecção': 'bg-blue-100 text-blue-800', 'amostra': 'bg-yellow-100 text-yellow-800', 'homologado': 'bg-green-100 text-green-800', 'negociacao': 'bg-purple-100 text-purple-800', 'pos_venda': 'bg-pink-100 text-pink-800', 'perdido': 'bg-red-100 text-red-800' }
const catLabels: Record<string, string> = { preco: 'Preço', prazo: 'Prazo', qualidade: 'Qualidade', concorrencia: 'Concorrência', sem_resposta: 'Sem resposta', outro: 'Outro' }
const tipoInteracaoIcon: Record<string, string> = { email: '📧', whatsapp: '💬', ligacao: '📞', reuniao: '🤝', instagram: '📸', linkedin: '💼', nota: '📝' }
const tipoInteracaoLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', ligacao: 'Ligação', reuniao: 'Reunião', instagram: 'Instagram', linkedin: 'LinkedIn', nota: 'Observação' }

export default function ClientePanel({
  cliente: c, interacoes, tarefas, vendedores, loggedUser,
  onClose, onEditCliente, onMoverCliente,
  onTriggerAmostra, onTriggerNegociacao, onTriggerPerda,
  setInteracoes, setClientes, setTarefas, addNotificacao
}: ClientePanelProps) {
  const [panelTab, setPanelTab] = useState<'info' | 'atividades' | 'tarefas' | 'timeline'>('info')
  const [panelAtividadeTipo, setPanelAtividadeTipo] = useState<Interacao['tipo'] | ''>('')
  const [panelAtividadeDesc, setPanelAtividadeDesc] = useState('')
  const [panelNota, setPanelNota] = useState('')
  const [panelNovaTarefa, setPanelNovaTarefa] = useState(false)
  const [panelTarefaTitulo, setPanelTarefaTitulo] = useState('')
  const [panelTarefaData, setPanelTarefaData] = useState(new Date().toISOString().split('T')[0])
  const [panelTarefaTipo, setPanelTarefaTipo] = useState<Tarefa['tipo']>('follow-up')
  const [panelTarefaPrioridade, setPanelTarefaPrioridade] = useState<Tarefa['prioridade']>('media')

  const vendedor = vendedores.find(v => v.id === c.vendedorId)
  const diasNaEtapa = c.dataEntradaEtapa ? Math.floor((Date.now() - new Date(c.dataEntradaEtapa).getTime()) / 86400000) : 0
  const clienteInteracoes = interacoes.filter(i => i.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  const clienteTarefas = tarefas.filter(t => t.clienteId === c.id).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const handleRegistrarAtividade = async () => {
    if (!panelAtividadeTipo || !panelAtividadeDesc.trim()) return
    try {
      const savedI = await db.insertInteracao({
        clienteId: c.id, tipo: panelAtividadeTipo, data: new Date().toISOString(),
        assunto: `${tipoInteracaoLabel[panelAtividadeTipo]} - ${c.razaoSocial}`,
        descricao: panelAtividadeDesc.trim(), automatico: false
      })
      setInteracoes(prev => [savedI, ...prev])
      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(c.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
    } catch (err) { logger.error('Erro ao registrar atividade:', err) }
    setPanelAtividadeTipo('')
    setPanelAtividadeDesc('')
    addNotificacao('success', 'Atividade registrada', `${tipoInteracaoLabel[panelAtividadeTipo]}: ${c.razaoSocial}`, c.id)
  }

  const handleSalvarNota = async () => {
    if (!panelNota.trim()) return
    try {
      const savedI = await db.insertInteracao({
        clienteId: c.id, tipo: 'nota', data: new Date().toISOString(),
        assunto: `📝 Observação - ${c.razaoSocial}`, descricao: panelNota.trim(), automatico: false
      })
      setInteracoes(prev => [savedI, ...prev])
      const hoje = new Date().toISOString().split('T')[0]
      await db.updateCliente(c.id, { ultimaInteracao: hoje })
      setClientes(prev => prev.map(cl => cl.id === c.id ? { ...cl, ultimaInteracao: hoje } : cl))
    } catch (err) { logger.error('Erro ao salvar nota:', err) }
    setPanelNota('')
    addNotificacao('success', 'Observação salva', c.razaoSocial, c.id)
  }

  const handleCriarTarefa = async () => {
    if (!panelTarefaTitulo.trim()) return
    try {
      const saved = await db.insertTarefa({
        titulo: panelTarefaTitulo.trim(), data: panelTarefaData,
        tipo: panelTarefaTipo, status: 'pendente', prioridade: panelTarefaPrioridade, clienteId: c.id, vendedorId: c.vendedorId || loggedUser?.id
      })
      setTarefas(prev => [saved, ...prev])
    } catch (err) { logger.error('Erro ao criar tarefa:', err) }
    setPanelTarefaTitulo('')
    setPanelNovaTarefa(false)
    addNotificacao('success', 'Tarefa criada', `${panelTarefaTitulo.trim()} - ${c.razaoSocial}`, c.id)
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black bg-opacity-30" onClick={onClose} />
      <div className="relative w-full sm:max-w-xl bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{c.razaoSocial}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${etapaCores[c.etapa] || 'bg-gray-100 text-gray-800'}`}>{etapaLabels[c.etapa] || c.etapa}</span>
                <span className="text-xs text-gray-500">Há {diasNaEtapa}d nesta etapa</span>
                {c.score !== undefined && <span className="text-xs font-bold text-gray-600 ml-auto">Score: {c.score}</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-apple ml-2"><XMarkIcon className="h-5 w-5 text-gray-500" /></button>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-gray-100">
            {([['info', '📋 Info'], ['timeline', '🕐 Timeline'], ['atividades', '📞 Ativ.'], ['tarefas', '✅ Tarefas']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setPanelTab(key)} className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${panelTab === key ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {label}
                {key === 'atividades' && clienteInteracoes.length > 0 ? ` (${clienteInteracoes.length})` : ''}
                {key === 'tarefas' && clienteTarefas.length > 0 ? ` (${clienteTarefas.length})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5">

          {/* === ABA INFO === */}
          {panelTab === 'info' && (
            <>
              {/* Contato */}
              <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">📇 Contato</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-gray-500">Nome</p><p className="font-medium text-gray-900">{c.contatoNome}</p></div>
                  <div><p className="text-xs text-gray-500">CNPJ</p><p className="font-medium text-gray-900">{c.cnpj}</p></div>
                  <div><p className="text-xs text-gray-500">Telefone</p><p className="font-medium text-gray-900">{c.contatoTelefone}</p></div>
                  <div><p className="text-xs text-gray-500">Email</p><p className="font-medium text-gray-900 truncate">{c.contatoEmail}</p></div>
                </div>
                {c.endereco && <div><p className="text-xs text-gray-500">Endereço</p><p className="text-sm text-gray-900">{c.endereco}</p></div>}
                
                {/* Campos adicionais para CNPJ 2 e Endereço 2 */}
                {c.cnpj2 && (
                  <div><p className="text-xs text-gray-500">CNPJ 2</p><p className="font-medium text-gray-900">{c.cnpj2}</p></div>
                )}
                {c.enderecoRua2 && (
                  <div>
                    <p className="text-xs text-gray-500">Endereço 2</p>
                    <p className="text-sm text-gray-900">
                      {[c.enderecoRua2, c.enderecoNumero2, c.enderecoComplemento2, c.enderecoBairro2, c.enderecoCidade2, c.enderecoEstado2, c.enderecoCep2 ? `CEP ${c.enderecoCep2}` : '']
                        .filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Dados comerciais */}
              <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">💼 Dados Comerciais</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {c.valorEstimado && <div><p className="text-xs text-gray-500">Valor estimado</p><p className="font-bold text-primary-600">R$ {c.valorEstimado.toLocaleString('pt-BR')}</p></div>}
                  {vendedor && <div><p className="text-xs text-gray-500">Vendedor</p><p className="font-medium text-gray-900">{vendedor.nome}</p></div>}
                  {c.valorProposta && <div><p className="text-xs text-gray-500">Valor proposta</p><p className="font-bold text-purple-700">R$ {c.valorProposta.toLocaleString('pt-BR')}</p></div>}
                  {c.dataProposta && <div><p className="text-xs text-gray-500">Data proposta</p><p className="text-gray-900">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</p></div>}
                </div>
                {c.produtosInteresse && c.produtosInteresse.length > 0 && (
                  <div><p className="text-xs text-gray-500 mb-1">Produtos de interesse</p><div className="flex flex-wrap gap-1">{c.produtosInteresse.map(p => <span key={p} className="px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-full border border-primary-100">{p}</span>)}</div></div>
                )}
              </div>

              {/* Info da etapa atual */}
              <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">📊 Info da Etapa</h3>
                {c.etapa === 'amostra' && (
                  <div className="space-y-1 text-sm">
                    {c.dataEnvioAmostra && <p className="text-gray-700">📦 Amostra enviada em: <span className="font-medium">{new Date(c.dataEnvioAmostra).toLocaleDateString('pt-BR')}</span></p>}
                    {c.statusAmostra && <p className="text-gray-700">Status: <span className="font-medium">{({ enviada: '📤 Enviada', aguardando_resposta: '⏳ Aguardando', aprovada: '✅ Aprovada', rejeitada: '❌ Rejeitada' })[c.statusAmostra]}</span></p>}
                    <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(30 - (c.dataEnvioAmostra ? Math.floor((Date.now() - new Date(c.dataEnvioAmostra).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
                  </div>
                )}
                {c.etapa === 'homologado' && (
                  <div className="space-y-1 text-sm">
                    {c.dataHomologacao && <p className="text-gray-700">✅ Homologado em: <span className="font-medium">{new Date(c.dataHomologacao).toLocaleDateString('pt-BR')}</span></p>}
                    {c.proximoPedidoPrevisto && <p className="text-gray-700">🛒 Próximo pedido: <span className="font-medium">{new Date(c.proximoPedidoPrevisto).toLocaleDateString('pt-BR')}</span></p>}
                    <p className="text-gray-700">Prazo: <span className="font-medium">{Math.max(75 - (c.dataHomologacao ? Math.floor((Date.now() - new Date(c.dataHomologacao).getTime()) / 86400000) : 0), 0)} dias restantes</span></p>
                  </div>
                )}
                {c.etapa === 'negociacao' && (
                  <div className="space-y-1 text-sm">
                    {c.valorProposta && <p className="text-gray-700">💰 Proposta: <span className="font-bold">R$ {c.valorProposta.toLocaleString('pt-BR')}</span></p>}
                    {c.dataProposta && <p className="text-gray-700">📅 Enviada em: <span className="font-medium">{new Date(c.dataProposta).toLocaleDateString('pt-BR')}</span></p>}
                  </div>
                )}
                {c.etapa === 'pos_venda' && (
                  <div className="space-y-1 text-sm">
                    {c.statusEntrega && <p className="text-gray-700">Status: <span className="font-medium">{({ preparando: '📋 Preparando', enviado: '🚚 Enviado', entregue: '✅ Entregue' })[c.statusEntrega]}</span></p>}
                    {c.dataUltimoPedido && <p className="text-gray-700">📦 Último pedido: <span className="font-medium">{new Date(c.dataUltimoPedido).toLocaleDateString('pt-BR')}</span></p>}
                  </div>
                )}
                {c.etapa === 'perdido' && (
                  <div className="space-y-1 text-sm">
                    {c.categoriaPerda && <p className="text-gray-700">Categoria: <span className="font-medium">{catLabels[c.categoriaPerda]}</span></p>}
                    {c.motivoPerda && <p className="text-gray-700">Motivo: <span className="font-medium">{c.motivoPerda}</span></p>}
                    {c.etapaAnterior && <p className="text-gray-700">Veio de: <span className="font-medium">{etapaLabels[c.etapaAnterior]}</span></p>}
                    {c.dataPerda && <p className="text-gray-700">Data: <span className="font-medium">{new Date(c.dataPerda).toLocaleDateString('pt-BR')}</span></p>}
                  </div>
                )}
                {c.etapa === 'prospecção' && (
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-700">📅 Em prospecção há {diasNaEtapa} dias</p>
                    {c.diasInativo !== undefined && <p className="text-gray-700">⏳ Última interação: {c.diasInativo} dias atrás</p>}
                  </div>
                )}
              </div>

              {/* Timeline */}
              {c.historicoEtapas && c.historicoEtapas.length > 0 && (
                <div className="bg-gray-50 rounded-apple border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">🗺️ Jornada no Funil</h3>
                  <div className="relative pl-4 border-l-2 border-gray-300 space-y-3">
                    {c.historicoEtapas.map((h, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${i === c.historicoEtapas!.length - 1 ? 'bg-primary-600 ring-2 ring-primary-200' : 'bg-gray-400'}`} />
                        <div className="ml-2">
                          <p className="text-sm font-medium text-gray-900">{etapaLabels[h.etapa] || h.etapa}</p>
                          <p className="text-xs text-gray-500">{new Date(h.data).toLocaleDateString('pt-BR')} {h.de && `← ${etapaLabels[h.de] || h.de}`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ações rápidas */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">⚡ Ações Rápidas</h3>
                <div className="flex flex-wrap gap-2">
                  {c.etapa !== 'perdido' && (
                    <button onClick={() => { onEditCliente(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-apple hover:bg-gray-50">✏️ Editar</button>
                  )}
                  {c.etapa === 'prospecção' && (
                    <button onClick={() => { onTriggerAmostra(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-apple hover:bg-yellow-700">📦 Enviar Amostra</button>
                  )}
                  {c.etapa === 'amostra' && (
                    <button onClick={() => { onMoverCliente(c.id, 'homologado', { dataHomologacao: new Date().toISOString().split('T')[0], statusAmostra: 'aprovada' }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">✅ Homologar</button>
                  )}
                  {c.etapa === 'homologado' && (
                    <button onClick={() => { onTriggerNegociacao(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-apple hover:bg-purple-700">💰 Negociar</button>
                  )}
                  {c.etapa === 'negociacao' && (
                    <>
                      <button onClick={() => { onMoverCliente(c.id, 'pos_venda', { statusEntrega: 'preparando', dataUltimoPedido: new Date().toISOString().split('T')[0] }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-apple hover:bg-green-700">🎉 Ganhou</button>
                      <button onClick={() => { onMoverCliente(c.id, 'homologado', {}); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-apple hover:bg-gray-300">↩ Voltou p/ Homologado</button>
                    </>
                  )}
                  {c.etapa !== 'perdido' && (
                    <button onClick={() => { onTriggerPerda(c); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-apple hover:bg-red-100">❌ Perdido</button>
                  )}
                  {c.etapa === 'perdido' && (
                    <button onClick={() => { onMoverCliente(c.id, 'prospecção', { motivoPerda: undefined, categoriaPerda: undefined, dataPerda: undefined }); onClose() }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-apple hover:bg-blue-700">🔄 Reativar</button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* === ABA TIMELINE === */}
          {panelTab === 'timeline' && (() => {
            type TimelineItem = { date: string; icon: string; title: string; subtitle: string; color: string }
            const items: TimelineItem[] = []

            clienteInteracoes.forEach(i => items.push({
              date: i.data,
              icon: tipoInteracaoIcon[i.tipo] || '📋',
              title: i.assunto,
              subtitle: i.descricao || '',
              color: i.automatico ? 'bg-gray-400' : 'bg-primary-500',
            }))

            ;(c.historicoEtapas || []).forEach(h => items.push({
              date: h.data,
              icon: '🔀',
              title: `Movido para ${etapaLabels[h.etapa] || h.etapa}`,
              subtitle: h.de ? `← De: ${etapaLabels[h.de] || h.de}` : '',
              color: 'bg-indigo-500',
            }))

            clienteTarefas.filter(t => t.status === 'concluida').forEach(t => items.push({
              date: t.data,
              icon: '✅',
              title: t.titulo,
              subtitle: `Tarefa concluída · ${t.tipo}`,
              color: 'bg-green-500',
            }))

            items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

            return items.length === 0 ? (
              <div className="bg-gray-50 rounded-apple border border-gray-200 p-10 text-center">
                <p className="text-sm text-gray-500">Nenhuma atividade registrada ainda.</p>
                <p className="text-xs text-gray-400 mt-1">Use a aba Atividades para registrar interações.</p>
              </div>
            ) : (
              <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="relative">
                    <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${item.color}`} />
                    <div className="ml-2 bg-white rounded-apple border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base flex-shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.title}</p>
                          {item.subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.subtitle}</p>}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {new Date(item.date).toLocaleDateString('pt-BR')} às {new Date(item.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* === ABA ATIVIDADES === */}
          {panelTab === 'atividades' && (
            <>
              {/* Registrar Atividade */}
              <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">📞 Registrar Atividade</h3>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {([['ligacao', '📞', 'Ligação'], ['whatsapp', '💬', 'WhatsApp'], ['email', '📧', 'Email'], ['reuniao', '🤝', 'Reunião'], ['instagram', '📸', 'Instagram'], ['linkedin', '💼', 'LinkedIn']] as const).map(([tipo, icon, label]) => (
                    <button key={tipo} onClick={() => setPanelAtividadeTipo(panelAtividadeTipo === tipo ? '' : tipo)} className={`flex flex-col items-center gap-1 p-2 rounded-apple text-xs font-medium transition-all ${panelAtividadeTipo === tipo ? 'bg-primary-100 border-2 border-primary-500 text-primary-700 shadow-sm' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                        <span className="text-lg">{icon}</span>
                        <span>{label}</span>
                      </button>
                  ))}
                </div>
                {panelAtividadeTipo && (
                  <div className="space-y-2">
                    <textarea
                      value={panelAtividadeDesc}
                      onChange={(e) => setPanelAtividadeDesc(e.target.value)}
                      placeholder={`Descreva a ${tipoInteracaoLabel[panelAtividadeTipo] || 'atividade'}...`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                    <button onClick={handleRegistrarAtividade} disabled={!panelAtividadeDesc.trim()} className="w-full px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      ✅ Registrar {tipoInteracaoLabel[panelAtividadeTipo]}
                    </button>
                  </div>
                )}
              </div>

              {/* Observação rápida */}
              <div className="bg-gray-50 rounded-apple border border-gray-200 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">📝 Observação Rápida</h3>
                <textarea
                  value={panelNota}
                  onChange={(e) => setPanelNota(e.target.value)}
                  placeholder="Escreva uma nota ou observação sobre este cliente..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white"
                  rows={2}
                />
                <button onClick={handleSalvarNota} disabled={!panelNota.trim()} className="px-4 py-1.5 bg-gray-800 text-white rounded-apple text-xs font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  💾 Salvar Observação
                </button>
              </div>

              {/* Histórico de interações */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">🕐 Histórico de Interações ({clienteInteracoes.length})</h3>
                {clienteInteracoes.length === 0 ? (
                  <div className="bg-gray-50 rounded-apple border border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-500">Nenhuma interação registrada ainda.</p>
                    <p className="text-xs text-gray-400 mt-1">Use os botões acima para registrar a primeira atividade!</p>
                  </div>
                ) : (
                  <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                    {clienteInteracoes.slice(0, 15).map((inter) => (
                      <div key={inter.id} className="relative">
                        <div className={`absolute -left-[1.3rem] w-3 h-3 rounded-full ${inter.automatico ? 'bg-gray-400' : 'bg-primary-500'}`} />
                        <div className="ml-2 bg-white rounded-apple border border-gray-200 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{tipoInteracaoIcon[inter.tipo] || '📋'} {inter.assunto}</span>
                            {inter.automatico && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full">Auto</span>}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{inter.descricao}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{new Date(inter.data).toLocaleDateString('pt-BR')} às {new Date(inter.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    ))}
                    {clienteInteracoes.length > 15 && <p className="text-xs text-gray-400 text-center">... e mais {clienteInteracoes.length - 15} interações</p>}
                  </div>
                )}
              </div>
            </>
          )}

          {/* === ABA TAREFAS === */}
          {panelTab === 'tarefas' && (
            <>
              {/* Botão nova tarefa */}
              {!panelNovaTarefa ? (
                <button onClick={() => setPanelNovaTarefa(true)} className="w-full px-4 py-3 bg-primary-50 border-2 border-dashed border-primary-300 rounded-apple text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors">
                  ➕ Nova Tarefa para {c.razaoSocial}
                </button>
              ) : (
                <div className="bg-white rounded-apple border-2 border-primary-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">📋 Nova Tarefa</h3>
                  <input
                    type="text"
                    value={panelTarefaTitulo}
                    onChange={(e) => setPanelTarefaTitulo(e.target.value)}
                    placeholder="Título da tarefa... ex: Ligar para confirmar pedido"
                    className="w-full px-3 py-2 border border-gray-300 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Data</label>
                      <input type="date" value={panelTarefaData} onChange={(e) => setPanelTarefaData(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                      <select value={panelTarefaTipo} onChange={(e) => setPanelTarefaTipo(e.target.value as Tarefa['tipo'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="follow-up">Follow-up</option>
                        <option value="ligacao">Ligação</option>
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="reuniao">Reunião</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Prioridade</label>
                      <select value={panelTarefaPrioridade} onChange={(e) => setPanelTarefaPrioridade(e.target.value as Tarefa['prioridade'])} className="w-full px-2 py-1.5 border border-gray-300 rounded-apple text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCriarTarefa} disabled={!panelTarefaTitulo.trim()} className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-apple text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">✅ Criar Tarefa</button>
                    <button onClick={() => setPanelNovaTarefa(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-apple text-sm font-medium hover:bg-gray-200">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Lista de tarefas */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">📋 Tarefas do Cliente ({clienteTarefas.length})</h3>
                {clienteTarefas.length === 0 ? (
                  <div className="bg-gray-50 rounded-apple border border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-500">Nenhuma tarefa vinculada a este cliente.</p>
                    <p className="text-xs text-gray-400 mt-1">Crie a primeira tarefa acima!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clienteTarefas.map((t) => (
                      <div key={t.id} className={`bg-white rounded-apple border p-3 ${t.status === 'concluida' ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-2">
                          <button onClick={async () => { const newStatus = t.status === 'concluida' ? 'pendente' : 'concluida'; try { await db.updateTarefa(t.id, { status: newStatus }); } catch (err) { logger.error('Erro toggle tarefa:', err) } setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x)) }} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.status === 'concluida' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-primary-500'}`}>
                            {t.status === 'concluida' && <span className="text-xs">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${t.status === 'concluida' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{t.titulo}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-gray-400">{new Date(t.data).toLocaleDateString('pt-BR')}</span>
                              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${t.prioridade === 'alta' ? 'bg-red-100 text-red-700' : t.prioridade === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{t.prioridade}</span>
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 rounded-full">{t.tipo}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
