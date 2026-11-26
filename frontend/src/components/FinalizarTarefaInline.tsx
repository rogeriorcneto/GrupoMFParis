import React, { useMemo, useState } from 'react'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import type { Tarefa } from '../types'
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
  loading?: boolean
  onConfirm: (input: FinalizacaoTarefaInput) => void | Promise<void>
  onCancel: () => void
}

const inputClass = 'w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-300 placeholder:text-gray-400'

export default function FinalizarTarefaInline({ tarefa, loading = false, onConfirm, onCancel }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const canalPrevisto = canalPrevistoDaTarefa(tarefa.tipo)
  const tipoPrevistoValido = tipoTarefaValidoParaNovoFluxo(tarefa.tipo) ? tarefa.tipo as CanalTarefa : 'ligacao'
  const [canalUsado, setCanalUsado] = useState<CanalTarefa | ''>(canalPrevisto)
  const [conclusao, setConclusao] = useState('')
  const [proxTipo, setProxTipo] = useState<CanalTarefa>(tipoPrevistoValido)
  const [proxObjetivo, setProxObjetivo] = useState<ObjetivoTarefa>(tarefa.objetivo || 'relacionamento')
  const [proxData, setProxData] = useState(addDiasISO(hoje, 1))
  const [proxDescricao, setProxDescricao] = useState('')
  const [justificativa, setJustificativa] = useState('')

  const precisaJustificativa = proxData ? exigeJustificativaPrazoLongo(proxData, hoje) : false
  const formValido = !!canalUsado
    && !!conclusao.trim()
    && !!proxTipo
    && !!proxObjetivo
    && !!proxData
    && !!proxDescricao.trim()
    && (!precisaJustificativa || !!justificativa.trim())

  const confirmar = async () => {
    if (!formValido || !canalUsado) return
    await onConfirm({
      canalUsado,
      conclusao: conclusao.trim(),
      proximoPasso: {
        tipo: proxTipo,
        objetivo: proxObjetivo,
        data: proxData,
        descricao: proxDescricao.trim(),
        justificativaPrazoLongo: justificativa.trim() || undefined,
      },
    })
  }

  return (
    <div className="mt-3 p-3 bg-green-50/80 border border-green-100 rounded-xl space-y-3 animate-in slide-in-from-top-1 duration-200">
      <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
        <CheckCircleIcon className="h-3.5 w-3.5" />
        Finalizar tarefa e agendar próximo passo
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

      {/* 3. Próximo passo */}
      <div className="pt-2 border-t border-green-100 space-y-2.5">
        <p className="text-[11px] font-semibold text-gray-600">3. Próximo passo *</p>
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
              value={proxData}
              onChange={e => setProxData(e.target.value)}
              onClick={e => (e.target as HTMLInputElement).showPicker?.()}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Descrição curta *</label>
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

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={confirmar}
          disabled={loading || !formValido}
          className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1 whitespace-nowrap"
          title={!formValido ? 'Preencha todos os campos obrigatórios' : 'Finalizar e criar próximo passo'}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {loading ? 'Finalizando...' : 'Finalizar e agendar'}
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
