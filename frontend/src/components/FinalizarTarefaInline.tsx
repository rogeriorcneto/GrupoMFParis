import React, { useMemo, useState } from 'react'
import { CheckCircleIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { Cliente, Produto, Tarefa } from '../types'
import {
  addDiasISO,
  CANAIS_TAREFA,
  CANAL_LABEL,
  canalPrevistoDaTarefa,
  CanalTarefa,
  exigeJustificativaPrazoLongo,
  FinalizacaoTarefaInput,
  OBJETIVO_LABEL,
  OBJETIVOS_TAREFA,
  ObjetivoTarefa,
  tipoTarefaValidoParaNovoFluxo,
} from '../utils/tarefaFluxo'

interface Props {
  tarefa: Tarefa
  outraTarefaAberta?: Tarefa
  cliente?: Cliente
  produtosCatalogo?: Produto[]
  exigeProdutosInteresse?: boolean
  vendedorNome?: string
  loading?: boolean
  onConfirm: (input: FinalizacaoTarefaInput) => void | Promise<void>
  onCancel: () => void
}

const inputClass = 'w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-300 placeholder:text-gray-400'

export default function FinalizarTarefaInline({
  tarefa,
  outraTarefaAberta,
  cliente,
  produtosCatalogo = [],
  exigeProdutosInteresse = false,
  vendedorNome = 'Vendedor',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const hoje = useMemo(() => new Date(), [])
  const canalPrevisto = canalPrevistoDaTarefa(tarefa.tipo)
  const tipoPrevistoValido = tipoTarefaValidoParaNovoFluxo(tarefa.tipo) ? tarefa.tipo as CanalTarefa : 'ligacao'
  const [canalUsado, setCanalUsado] = useState<CanalTarefa | ''>(canalPrevisto || tipoPrevistoValido)
  const [conclusao, setConclusao] = useState('')
  const [proxTipo, setProxTipo] = useState<CanalTarefa | ''>('')
  const [proxObjetivo, setProxObjetivo] = useState<ObjetivoTarefa | ''>('')
  const [proxData, setProxData] = useState('')
  const [proxDescricao, setProxDescricao] = useState('')
  const [justificativa, setJustificativa] = useState('')

  const produtosIniciais = useMemo(() => {
    const nomes = (cliente?.produtosInteresse || []).filter(Boolean)
    const qtds = cliente?.produtosQuantidadesMensais || {}
    if (nomes.length > 0) {
      return nomes.map(nome => {
        const info = qtds[nome] as any
        const kg = typeof info === 'number' ? info : info?.kgMes
        return { nome, kgMes: kg && kg > 0 ? String(kg) : '' }
      })
    }
    return [{ nome: '', kgMes: '' }]
  }, [cliente?.id])
  const [itensProdutos, setItensProdutos] = useState<{ nome: string; kgMes: string }[]>(produtosIniciais)

  // Item 4: Se já existe qualquer outra tarefa aberta para o cliente, NUNCA abre e NUNCA salva próximo passo.
  // Só exige próximo passo quando esta é a ÚLTIMA tarefa aberta do cliente (sem preencher campos automaticamente).
  const exigeProximoPasso = !outraTarefaAberta
  const mostrarProximoPasso = exigeProximoPasso
  const precisaJustificativa = mostrarProximoPasso && proxData ? exigeJustificativaPrazoLongo(proxData, hoje) : false

  const produtosValidos = useMemo(() => {
    if (!exigeProdutosInteresse) return true
    const preenchidos = itensProdutos.filter(i => i.nome.trim() || i.kgMes.trim())
    if (preenchidos.length === 0) return false
    return preenchidos.every(i => {
      const kg = Number(i.kgMes.replace(',', '.'))
      return !!i.nome.trim() && Number.isFinite(kg) && kg > 0
    })
  }, [exigeProdutosInteresse, itensProdutos])

  const hojeISO = useMemo(() => addDiasISO(hoje, 0), [hoje])
  const proximoValido = !mostrarProximoPasso || (
    !!proxTipo
    && !!proxObjetivo
    && !!proxData
    && proxData >= hojeISO
    && (!precisaJustificativa || !!justificativa.trim())
  )

  const formValido = !!canalUsado
    && !!conclusao.trim()
    && produtosValidos
    && proximoValido

  const confirmar = async () => {
    if (!formValido || !canalUsado) return
    let produtosInteresseRegistro: FinalizacaoTarefaInput['produtosInteresseRegistro']
    if (exigeProdutosInteresse) {
      const agoraISO = new Date().toISOString()
      const nomes: string[] = []
      const consumo: NonNullable<Cliente['produtosQuantidadesMensais']> = { ...(cliente?.produtosQuantidadesMensais || {}) }
      for (const item of itensProdutos) {
        const nome = item.nome.trim()
        if (!nome) continue
        const kg = Number(item.kgMes.replace(',', '.'))
        if (!nomes.includes(nome)) nomes.push(nome)
        consumo[nome] = { kgMes: kg, atualizadoEm: agoraISO, vendedorNome }
      }
      produtosInteresseRegistro = {
        produtosInteresse: nomes,
        produtosQuantidadesMensais: consumo,
      }
    }

    await onConfirm({
      canalUsado,
      conclusao: conclusao.trim(),
      ...(exigeProximoPasso && proxTipo && proxObjetivo && proxData ? {
        proximoPasso: {
          tipo: proxTipo,
          objetivo: proxObjetivo,
          data: proxData,
          descricao: proxDescricao.trim(),
          justificativaPrazoLongo: precisaJustificativa ? (justificativa.trim() || undefined) : undefined,
        },
      } : {}),
      ...(produtosInteresseRegistro ? { produtosInteresseRegistro } : {}),
    })
  }

  const datalistId = `produtos-interesse-${tarefa.id}`

  return (
    <div className="mt-3 p-3 bg-green-50/80 border border-green-100 rounded-xl space-y-3 animate-in slide-in-from-top-1 duration-200">
      <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
        <CheckCircleIcon className="h-3.5 w-3.5" />
        {exigeProximoPasso ? 'Finalizar tarefa e agendar próximo passo' : 'Finalizar tarefa'}
      </p>

      {/* 1. Canal usado */}
      <div>
        <p className="text-[11px] font-semibold text-gray-600 mb-1.5">1. Canal usado *</p>
        <div className="flex flex-wrap gap-1.5">
          {CANAIS_TAREFA.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCanalUsado(c)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                canalUsado === c
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {CANAL_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Conclusão */}
      <div>
        <p className="text-[11px] font-semibold text-gray-600 mb-1.5">2. Conclusão *</p>
        <textarea
          value={conclusao}
          onChange={e => setConclusao(e.target.value)}
          rows={2}
          placeholder="O que aconteceu no contato?"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Registro de produtos de interesse com consumo mensal em kg (quando aplicável) */}
      {exigeProdutosInteresse && (
        <div className="pt-2 border-t border-green-100 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-700">Produtos de interesse e consumo mensal (kg/mês) *</p>
            <button
              type="button"
              onClick={() => setItensProdutos(prev => [...prev, { nome: '', kgMes: '' }])}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:text-primary-800"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Adicionar produto
            </button>
          </div>
          {produtosCatalogo.length > 0 && (
            <datalist id={datalistId}>
              {produtosCatalogo.filter(p => p.ativo !== false).map(p => (
                <option key={p.id} value={p.nome} />
              ))}
            </datalist>
          )}
          <div className="space-y-1.5">
            {itensProdutos.map((it, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  list={produtosCatalogo.length > 0 ? datalistId : undefined}
                  value={it.nome}
                  onChange={e => setItensProdutos(prev => prev.map((x, i) => i === idx ? { ...x, nome: e.target.value } : x))}
                  placeholder="Produto de interesse"
                  className="flex-1 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5"
                />
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={it.kgMes}
                  onChange={e => setItensProdutos(prev => prev.map((x, i) => i === idx ? { ...x, kgMes: e.target.value } : x))}
                  placeholder="kg/mês"
                  className="w-24 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5"
                />
                {itensProdutos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItensProdutos(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Remover produto"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aviso informativo quando já existe outra tarefa aberta: NÃO abre nem salva próximo passo */}
      {outraTarefaAberta && (
        <div className="pt-2 border-t border-green-100 text-[11px] text-green-800">
          Já existe outra tarefa aberta para este cliente: <strong>{outraTarefaAberta.titulo}</strong>
          {outraTarefaAberta.data ? ` (${new Date(`${outraTarefaAberta.data}T00:00:00`).toLocaleDateString('pt-BR')})` : ''}.
        </div>
      )}

      {/* 3. Próximo passo (exibido SOMENTE quando é a última tarefa aberta do cliente) */}
      {mostrarProximoPasso && (
        <div className="pt-2 border-t border-green-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-600">
              3. Próximo passo *
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Tipo *</label>
              <div className="flex flex-wrap gap-1">
                {CANAIS_TAREFA.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setProxTipo(c)}
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${
                      proxTipo === c ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {CANAL_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Objetivo *</label>
              <select value={proxObjetivo} onChange={e => setProxObjetivo(e.target.value as ObjetivoTarefa)} className={inputClass}>
                <option value="">Selecione o objetivo...</option>
                {OBJETIVOS_TAREFA.map(o => <option key={o} value={o}>{OBJETIVO_LABEL[o]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Data *</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'Amanhã', dias: 1 },
                { label: '3 dias', dias: 3 },
                { label: '7 dias', dias: 7 },
                { label: '15 dias', dias: 15 },
              ].map(b => (
                <button
                  key={b.dias}
                  type="button"
                  onClick={() => setProxData(addDiasISO(hoje, b.dias))}
                  className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${
                    proxData === addDiasISO(hoje, b.dias) ? 'bg-primary-50 text-primary-700 border-primary-300' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {b.label}
                </button>
              ))}
              <input
                type="date"
                min={hojeISO}
                value={proxData}
                onChange={e => setProxData(e.target.value)}
                onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Descrição curta (opcional)</label>
            <input
              value={proxDescricao}
              onChange={e => setProxDescricao(e.target.value)}
              placeholder="Ex: verificar estoque e retomar oferta"
              className={inputClass}
            />
          </div>

          {precisaJustificativa && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
              <label className="block text-[11px] font-semibold text-orange-800 mb-1">
                Justificativa obrigatória — próximo passo acima de 15 dias *
              </label>
              <textarea
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                rows={2}
                placeholder='Ex: "Cliente parou a linha de sorvete até março"'
                className="w-full text-xs text-gray-700 bg-white border border-orange-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 placeholder:text-gray-400"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={confirmar}
          disabled={loading || !formValido}
          className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1 whitespace-nowrap"
          title={!formValido ? 'Preencha todos os campos obrigatórios' : 'Salvar conclusão'}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {loading ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
