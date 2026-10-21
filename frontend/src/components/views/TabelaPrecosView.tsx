import React, { useEffect, useMemo, useState } from 'react'
import { authFetch, BOT_URL } from '../../lib/botApi'
import { fetchSimuladorParams, type SimuladorParams } from '../../data/simuladorPrecos'
import SimuladorPrecoPanel from '../SimuladorPrecoPanel'
import type { Vendedor } from '../../types'

interface Props {
  loggedUser: Vendedor | null
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

const pct = (n: number) => Math.round(n * 1000) / 10
const fromPct = (s: string) => (parseFloat(s.replace(',', '.')) || 0) / 100
const num = (s: string) => parseFloat(s.replace(',', '.')) || 0

export default function TabelaPrecosView({ loggedUser, showToast }: Props) {
  const isGerente = loggedUser?.cargo === 'gerente'
  const [params, setParams] = useState<SimuladorParams | null>(null)
  const [editando, setEditando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const carregar = () => fetchSimuladorParams(BOT_URL).then(setParams)
  useEffect(() => { carregar() }, [])

  const prodKeys = useMemo(() => Object.keys(params?.produtos ?? {}), [params])
  const prazoKeys = useMemo(() => Object.keys(params?.prazos ?? {}), [params])

  const updProd = (nome: string, campo: string, raw: string) => {
    setParams(prev => {
      if (!prev) return prev
      const v = campo.startsWith('com') || campo.startsWith('marg') ? fromPct(raw) : num(raw)
      return { ...prev, produtos: { ...prev.produtos, [nome]: { ...prev.produtos[nome], [campo]: v } } }
    })
  }

  const updPrazo = (prazo: string, raw: string) => {
    setParams(prev => prev && { ...prev, prazos: { ...prev.prazos, [prazo]: fromPct(raw) } })
  }

  const updFrete = (i: number, campo: 'label' | 'valor', raw: string) => {
    setParams(prev => {
      if (!prev) return prev
      const fretes = [...prev.fretes]
      fretes[i] = campo === 'label' ? { ...fretes[i], label: raw } : { ...fretes[i], valor: num(raw) }
      return { ...prev, fretes }
    })
  }

  const salvar = async () => {
    if (!params) return
    setSaving(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/simulador/params`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params }),
      })
      const j = await res.json()
      if (j.success) {
        showToast?.('success', 'Tabela de preços salva — simulador e página pública atualizados')
        setEditando(false)
        setReloadKey(k => k + 1)
        carregar()
      } else {
        showToast?.('error', j.error || 'Erro ao salvar')
      }
    } catch {
      showToast?.('error', 'Erro ao salvar tabela')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary-400'

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">💰 Tabela de Preços</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Custos, comissões e margens que alimentam o simulador de preço — no CRM e na página pública.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/simulador.html" target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 rounded-apple text-sm font-semibold border-2 border-gray-200 text-gray-600 hover:border-primary-300">
            ↗ Página pública
          </a>
          {isGerente && (
            <button
              onClick={() => setEditando(v => !v)}
              className={`px-4 py-2 rounded-apple shadow-apple-sm font-semibold transition-colors ${editando ? 'bg-gray-200 text-gray-700' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
            >
              {editando ? 'Cancelar edição' : '✏️ Editar tabela'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Simulador — recarrega params ao salvar via reloadKey */}
        <div className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Simulador</p>
          <SimuladorPrecoPanel key={reloadKey} />
        </div>

        {/* Grade de produtos */}
        <div className="lg:col-span-2 bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-4">
          {!params ? (
            <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
          ) : (
            <>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Produtos {editando && <span className="text-primary-600">(custo R$ · comissões/margens em %)</span>}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
                      <th className="py-1.5 pr-2">Produto</th>
                      <th className="py-1.5 pr-2 w-20">Custo</th>
                      <th className="py-1.5 pr-2 w-14">Com A%</th>
                      <th className="py-1.5 pr-2 w-14">Com B%</th>
                      <th className="py-1.5 pr-2 w-14">Marg A%</th>
                      <th className="py-1.5 w-14">Marg B%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodKeys.map(nome => {
                      const p = params.produtos[nome]
                      return (
                        <tr key={nome} className="border-b border-gray-50">
                          <td className="py-1.5 pr-2 font-medium text-gray-800">{nome}</td>
                          {(['custo', 'comA', 'comB', 'margA', 'margB'] as const).map(campo => (
                            <td key={campo} className="py-1 pr-2">
                              {editando ? (
                                <input
                                  className={inputCls}
                                  defaultValue={campo === 'custo' ? String(p.custo) : String(pct(p[campo]))}
                                  onBlur={e => updProd(nome, campo, e.target.value)}
                                />
                              ) : (
                                <span className="text-gray-600">
                                  {campo === 'custo' ? `R$ ${p.custo.toFixed(2)}` : `${pct(p[campo])}%`}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Taxa por prazo {editando && <span className="text-primary-600">(%)</span>}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {prazoKeys.map(prazo => (
                      <div key={prazo} className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 w-16 shrink-0" title={prazo}>{prazo}</span>
                        {editando ? (
                          <input className={inputCls} defaultValue={String(pct(params.prazos[prazo]))} onBlur={e => updPrazo(prazo, e.target.value)} />
                        ) : (
                          <span className="text-xs text-gray-600">{pct(params.prazos[prazo])}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Frete CIF {editando && <span className="text-primary-600">(R$/kg)</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {params.fretes.map((f, i) => (
                      <div key={f.key} className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 w-20 shrink-0" title={f.label}>{f.label}</span>
                        {editando ? (
                          <input className={inputCls} defaultValue={String(f.valor)} onBlur={e => updFrete(i, 'valor', e.target.value)} />
                        ) : (
                          <span className="text-xs text-gray-600">R$ {f.valor.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {editando && (
                <button
                  onClick={salvar}
                  disabled={saving}
                  className="mt-4 px-5 py-2.5 rounded-apple font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : '💾 Salvar tabela de preços'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
