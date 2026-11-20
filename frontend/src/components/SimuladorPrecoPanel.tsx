import React, { useEffect, useMemo, useState } from 'react'
import {
  encontrarProdutoSimulador,
  calcularPrecosTabela,
  fetchSimuladorParams,
  formatarMoeda,
  resolverTaxaPrazo,
  type SimuladorParams,
} from '../data/simuladorPrecos'
import { BOT_URL } from '../lib/botApi'
import { useParametrosListas } from '../lib/parametrosListas'

interface SimuladorPrecoPanelProps {
  produtoNome?: string
  prazoExterno?: string
  onUsarTabelaA?: (preco: number) => void
  onUsarTabelaB?: (preco: number) => void
}

export default function SimuladorPrecoPanel({ produtoNome, prazoExterno, onUsarTabelaA, onUsarTabelaB }: SimuladorPrecoPanelProps) {
  const [params, setParams] = useState<SimuladorParams | null>(null)
  const { parametros, opcoesAtivas } = useParametrosListas()

  useEffect(() => {
    fetchSimuladorParams(BOT_URL).then(setParams)
  }, [])

  const produtoKeys = useMemo(() => Object.keys(params?.produtos ?? {}), [params])

  // Item 2 Rodada 3.1: alimenta o dropdown de Prazo do simulador em tempo real com Parâmetros (incluindo novos prazos como "15/30/35")
  const prazoKeys = useMemo(() => {
    const ativosParam = opcoesAtivas('prazo_pagamento')
      .map(o => o.valor)
      .filter(v => resolverTaxaPrazo(v, params?.prazos) !== undefined)
    const desativadosSet = new Set(
      (parametros.listas.prazo_pagamento || []).filter(o => !o.ativo).map(o => o.valor)
    )
    const extrasTabela = Object.keys(params?.prazos ?? {}).filter(
      k => !ativosParam.includes(k) && !desativadosSet.has(k)
    )
    return ativosParam.length > 0 ? [...ativosParam, ...extrasTabela] : Object.keys(params?.prazos ?? {})
  }, [params, parametros, opcoesAtivas])

  // Respeita tipos de frete ativos em Parâmetros (se FOB for desativado, oculta FOB; se CIF for desativado, oculta faixas CIF)
  const freteOptions = useMemo(() => {
    const todos = params?.fretes ?? []
    const fretesParam = opcoesAtivas('tipo_frete').map(f => f.valor.toUpperCase())
    if (fretesParam.length === 0) return todos
    const temFob = fretesParam.includes('FOB')
    const temCif = fretesParam.includes('CIF')
    const filtrados = todos.filter(f => (f.key === 'FOB' ? temFob : temCif))
    return filtrados.length > 0 ? filtrados : todos
  }, [params, parametros, opcoesAtivas])

  const [produto, setProduto] = useState('')
  const [prazo, setPrazo] = useState('')
  const [freteKey, setFreteKey] = useState('')

  useEffect(() => {
    if (produtoKeys.length && !produto) {
      setProduto(produtoKeys[0])
      setPrazo(prazoExterno && prazoKeys.includes(prazoExterno) ? prazoExterno : (prazoKeys[0] || ''))
      setFreteKey(freteOptions[0]?.key || '')
    }
  }, [produtoKeys, prazoKeys, freteOptions, produto, prazoExterno])

  useEffect(() => {
    if (produtoNome && params) {
      const match = encontrarProdutoSimulador(produtoNome, params.produtos)
      if (match) setProduto(match)
    }
  }, [produtoNome, params])

  // Sincroniza o prazo do simulador com o prazo selecionado no pedido (pode ser alterado aqui só para comparar)
  useEffect(() => {
    if (prazoExterno && (prazoKeys.includes(prazoExterno) || resolverTaxaPrazo(prazoExterno, params?.prazos) !== undefined)) {
      setPrazo(prazoExterno)
    }
  }, [prazoExterno, prazoKeys, params])

  const result = useMemo(
    () => (params ? calcularPrecosTabela(produto, prazo, freteKey, params) : null),
    [params, produto, prazo, freteKey]
  )

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="block text-[10px] font-medium text-gray-500 uppercase">Produto</label>
        <select
          aria-label="Produto do simulador"
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
            aria-label="Prazo do simulador"
            value={prazo}
            onChange={e => setPrazo(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
          >
            {prazo && !prazoKeys.includes(prazo) && (
              <option value={prazo}>{prazo}</option>
            )}
            {prazoKeys.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-gray-500 uppercase">Frete</label>
          <select
            aria-label="Frete do simulador"
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
