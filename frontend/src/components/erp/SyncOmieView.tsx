import React, { useState } from 'react'
import {
  syncClientesOmie,
  syncAssociarClientesPorCnpj,
  syncProdutosOmie,
  syncLogisticaOmie,
  syncNumerosPedidoOmie,
  syncTransportadorasOmie,
  syncFuncionariosOmie,
  syncContasBancariasOmie,
  syncCategoriasOmie,
  syncLancamentosOmie,
  type SyncResult,
} from '../../lib/omieSync'

// ============================================================
// Definição dos passos de sincronização
// ============================================================
interface SyncStep {
  id: string
  titulo: string
  descricao: string
  icone: string
  cor: string
  fn: () => Promise<SyncResult>
}

const STEPS: SyncStep[] = [
  {
    id: 'clientes',
    titulo: 'Clientes',
    descricao: 'Insere/atualiza clientes do Omie no CRM (razão social, CNPJ, endereço, contatos).',
    icone: '🏢',
    cor: 'from-blue-500 to-cyan-500',
    fn: syncClientesOmie,
  },
  {
    id: 'associar',
    titulo: 'Associar Clientes ↔ Omie',
    descricao: 'Vincula clientes existentes do CRM ao Omie via CNPJ (popula `omie_codigo`).',
    icone: '🔗',
    cor: 'from-cyan-500 to-teal-500',
    fn: syncAssociarClientesPorCnpj,
  },
  {
    id: 'produtos',
    titulo: 'Produtos',
    descricao: 'Sincroniza catálogo de produtos do Omie (código, descrição, preço, unidade).',
    icone: '📦',
    cor: 'from-purple-500 to-indigo-500',
    fn: syncProdutosOmie,
  },
  {
    id: 'numeros-pedido',
    titulo: 'Números de Pedido',
    descricao: 'Sincroniza códigos/números de pedido entre CRM e Omie.',
    icone: '🔢',
    cor: 'from-indigo-500 to-blue-600',
    fn: syncNumerosPedidoOmie,
  },
  {
    id: 'logistica',
    titulo: 'Logística & Rastreio',
    descricao: 'Atualiza status logístico, NF, código de rastreio e data de faturamento dos clientes em follow-up.',
    icone: '🚚',
    cor: 'from-orange-500 to-red-500',
    fn: syncLogisticaOmie,
  },
  {
    id: 'transportadoras',
    titulo: 'Transportadoras',
    descricao: 'Importa transportadoras cadastradas no Omie (filtra por CNAE/tag).',
    icone: '🏭',
    cor: 'from-amber-500 to-orange-500',
    fn: syncTransportadorasOmie,
  },
  {
    id: 'vendedores',
    titulo: 'Vendedores / Funcionários',
    descricao: 'Importa vendedores do Omie para a tabela de funcionários.',
    icone: '👥',
    cor: 'from-pink-500 to-rose-500',
    fn: syncFuncionariosOmie,
  },
  {
    id: 'contas',
    titulo: 'Contas Bancárias',
    descricao: 'Sincroniza contas correntes/bancárias do Omie.',
    icone: '🏦',
    cor: 'from-emerald-500 to-green-500',
    fn: syncContasBancariasOmie,
  },
  {
    id: 'categorias',
    titulo: 'Categorias Financeiras',
    descricao: 'Sincroniza categorias de receita e despesa do Omie.',
    icone: '🗂️',
    cor: 'from-green-500 to-lime-500',
    fn: syncCategoriasOmie,
  },
  {
    id: 'lancamentos',
    titulo: 'Contas a Pagar / Receber',
    descricao: 'Sincroniza lançamentos financeiros (contas a pagar e receber) do Omie.',
    icone: '💰',
    cor: 'from-yellow-500 to-amber-500',
    fn: syncLancamentosOmie,
  },
]

// ============================================================
// Component
// ============================================================
type StepStatus = 'idle' | 'running' | 'success' | 'error'

interface StepState {
  status: StepStatus
  result?: SyncResult
  startedAt?: number
  finishedAt?: number
}

export default function SyncOmieView() {
  const [states, setStates] = useState<Record<string, StepState>>(() =>
    Object.fromEntries(STEPS.map(s => [s.id, { status: 'idle' as StepStatus }]))
  )
  const [runningAll, setRunningAll] = useState(false)
  const [logEntries, setLogEntries] = useState<{ timestamp: string; tipo: 'info' | 'success' | 'error'; mensagem: string }[]>([])

  const log = (tipo: 'info' | 'success' | 'error', mensagem: string) => {
    setLogEntries(prev => [...prev, { timestamp: new Date().toLocaleTimeString('pt-BR'), tipo, mensagem }])
  }

  const runStep = async (step: SyncStep): Promise<SyncResult> => {
    setStates(prev => ({ ...prev, [step.id]: { status: 'running', startedAt: Date.now() } }))
    log('info', `${step.icone} Iniciando: ${step.titulo}…`)
    try {
      const result = await step.fn()
      const status: StepStatus = result.success && result.erros.length === 0 ? 'success' : 'error'
      setStates(prev => ({
        ...prev,
        [step.id]: { status, result, startedAt: prev[step.id]?.startedAt, finishedAt: Date.now() },
      }))
      if (status === 'success') {
        log('success', `✅ ${step.titulo}: ${result.inseridos} inseridos · ${result.atualizados} atualizados${result.detalhes ? ` (${result.detalhes})` : ''}`)
      } else {
        log('error', `⚠️ ${step.titulo}: concluiu com ${result.erros.length} erro(s)`)
      }
      return result
    } catch (err: any) {
      const result: SyncResult = { success: false, inseridos: 0, atualizados: 0, erros: [err?.message || String(err)] }
      setStates(prev => ({
        ...prev,
        [step.id]: { status: 'error', result, startedAt: prev[step.id]?.startedAt, finishedAt: Date.now() },
      }))
      log('error', `❌ ${step.titulo}: ${err?.message || err}`)
      return result
    }
  }

  const runAll = async () => {
    if (runningAll) return
    setRunningAll(true)
    setLogEntries([])
    log('info', '🚀 Iniciando sincronização COMPLETA do Omie…')
    const inicio = Date.now()
    let totalInseridos = 0
    let totalAtualizados = 0
    let totalErros = 0
    for (const step of STEPS) {
      const result = await runStep(step)
      totalInseridos += result.inseridos
      totalAtualizados += result.atualizados
      totalErros += result.erros.length
    }
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1)
    log('info', `🏁 Sincronização finalizada em ${duracao}s · ${totalInseridos} inseridos · ${totalAtualizados} atualizados · ${totalErros} erro(s)`)
    setRunningAll(false)
  }

  const resetAll = () => {
    setStates(Object.fromEntries(STEPS.map(s => [s.id, { status: 'idle' as StepStatus }])))
    setLogEntries([])
  }

  const concluidos = Object.values(states).filter(s => s.status === 'success').length
  const totalSteps = STEPS.length
  const progresso = Math.round((concluidos / totalSteps) * 100)

  return (
    <div className="space-y-6">
      {/* Header com botão "Sincronizar TUDO" */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sincronização Omie</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Puxa <strong>tudo</strong> do Omie para o sistema: clientes, produtos, pedidos, financeiro, logística e mais.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={resetAll}
            disabled={runningAll}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            🔄 Resetar
          </button>
          <button
            onClick={runAll}
            disabled={runningAll}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 hover:opacity-90 text-white rounded-lg font-bold text-sm shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {runningAll ? (
              <>
                <span className="animate-spin">⚙️</span>
                Sincronizando…
              </>
            ) : (
              <>⚡ Sincronizar TUDO do Omie</>
            )}
          </button>
        </div>
      </div>

      {/* Barra de progresso global */}
      {runningAll && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700 dark:text-gray-200">Progresso geral</span>
            <span className="text-gray-500 dark:text-gray-400">{concluidos}/{totalSteps} ({progresso}%)</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 transition-all duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      )}

      {/* Cards de cada passo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STEPS.map(step => {
          const state = states[step.id]
          return (
            <div
              key={step.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 border-2 transition-colors ${
                state.status === 'running' ? 'border-blue-400 dark:border-blue-500' :
                state.status === 'success' ? 'border-green-400 dark:border-green-500' :
                state.status === 'error' ? 'border-red-400 dark:border-red-500' :
                'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`text-3xl rounded-lg p-2 bg-gradient-to-br ${step.cor} bg-opacity-10`}>
                    {step.icone}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white">{step.titulo}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{step.descricao}</p>
                  </div>
                </div>
                <StatusBadge status={state.status} />
              </div>

              {/* Resultado */}
              {state.result && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-sm">
                  {state.status === 'success' && (
                    <div className="text-green-700 dark:text-green-400 space-y-0.5">
                      <p>📥 <strong>{state.result.inseridos}</strong> inseridos · 🔄 <strong>{state.result.atualizados}</strong> atualizados</p>
                      {state.result.detalhes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{state.result.detalhes}</p>
                      )}
                    </div>
                  )}
                  {state.status === 'error' && (
                    <div className="text-red-700 dark:text-red-400 max-h-24 overflow-y-auto text-xs space-y-0.5">
                      {state.result.erros.slice(0, 5).map((e, i) => <p key={i}>• {e}</p>)}
                      {state.result.erros.length > 5 && <p className="text-gray-500">… +{state.result.erros.length - 5} erro(s)</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Botão individual */}
              <button
                onClick={() => runStep(step)}
                disabled={runningAll || state.status === 'running'}
                className="mt-3 w-full px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg disabled:opacity-50"
              >
                {state.status === 'running' ? 'Executando…' : 'Sincronizar este'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Log em tempo real */}
      {logEntries.length > 0 && (
        <div className="bg-gray-900 rounded-xl shadow-lg p-4 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-white text-sm">📋 Log de Execução</h3>
            <button onClick={() => setLogEntries([])} className="text-xs text-gray-400 hover:text-white">Limpar</button>
          </div>
          <div className="space-y-1 font-mono text-xs">
            {logEntries.map((entry, i) => (
              <div key={i} className={
                entry.tipo === 'success' ? 'text-green-400' :
                entry.tipo === 'error' ? 'text-red-400' :
                'text-gray-300'
              }>
                <span className="text-gray-500">[{entry.timestamp}]</span> {entry.mensagem}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: StepStatus }) {
  const config = {
    idle: { label: 'Aguardando', cor: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
    running: { label: '⏳ Em andamento', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse' },
    success: { label: '✅ Concluído', cor: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    error: { label: '⚠️ Erro', cor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  }[status]
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${config.cor}`}>
      {config.label}
    </span>
  )
}
