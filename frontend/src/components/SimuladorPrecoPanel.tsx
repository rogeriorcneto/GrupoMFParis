import React, { useEffect, useMemo, useState } from 'react'
import {
  SIMULADOR_PRODUTOS,
  SIMULADOR_PRAZOS,
  SIMULADOR_FRETES,
  encontrarProdutoSimulador,
  calcularPrecosTabela,
  formatarMoeda,
} from '../data/simuladorPrecos'

interface SimuladorPrecoPanelProps {
  produtoNome?: string
  onUsarTabelaA?: (preco: number) => void
  onUsarTabelaB?: (preco: number) => void
}

export default function SimuladorPrecoPanel({ produtoNome, onUsarTabelaA, onUsarTabelaB }: SimuladorPrecoPanelProps) {
  const produtoKeys = Object.keys(SIMULADOR_PRODUTOS)
  const [produto, setProduto] = useState(produtoKeys[0] || '')

  useEffect(() => {
    if (produtoNome) {
      const match = encontrarProdutoSimulador(produtoNome)
      if (match) setProduto(match)
    }
  }, [produtoNome])

  const prazoKeys = Object.keys(SIMULADOR_PRAZOS)
  const freteOptions = SIMULADOR_FRETES
  const [prazo, setPrazo] = useState(prazoKeys[0] || '')
  const [freteKey, setFreteKey] = useState(freteOptions[0]?.key || '')

  const result = useMemo(() => calcularPrecosTabela(produto, prazo, freteKey), [produto, prazo, freteKey])

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="block text-[10px] font-medium text-gray-500 uppercase">Produto</label>
        <select
          value={produto}
          onChange={e => setProduto(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
        >
          {produtoKeys.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-500 uppercase">Prazo</label>
          <select
            value={prazo}
            onChange={e => setPrazo(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
          >
            {prazoKeys.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-500 uppercase">Frete</label>
          <select
            value={freteKey}
            onChange={e => setFreteKey(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
          >
            {freteOptions.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {result ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
            <p className="text-[10px] text-blue-600 font-semibold uppercase">Tabela A</p>
            <p className="text-sm font-bold text-blue-700">{formatarMoeda(result.precoA)}</p>
            <p className="text-[10px] text-blue-500">Com {Math.round(result.comA * 100)}%</p>
            {onUsarTabelaA && (
              <button
                type="button"
                onClick={() => onUsarTabelaA(result.precoA)}
                className="mt-1.5 px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-700 transition-colors"
              >
                Usar A
              </button>
            )}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
            <p className="text-[10px] text-amber-600 font-semibold uppercase">Tabela B</p>
            <p className="text-sm font-bold text-amber-700">{formatarMoeda(result.precoB)}</p>
            <p className="text-[10px] text-amber-500">Com {Math.round(result.comB * 100)}%</p>
            {onUsarTabelaB && (
              <button
                type="button"
                onClick={() => onUsarTabelaB(result.precoB)}
                className="mt-1.5 px-2 py-0.5 bg-amber-600 text-white text-[10px] rounded hover:bg-amber-700 transition-colors"
              >
                Usar B
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">Selecione produto, prazo e frete para simular.</p>
      )}
    </div>
  )
}
