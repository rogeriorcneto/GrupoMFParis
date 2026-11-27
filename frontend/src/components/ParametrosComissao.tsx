// Item 3 — Tela de Parâmetros > Comissão
// Lista todos os produtos com 4 colunas editáveis pelo gestor:
// "% Tabela A – CLT", "% Tabela B – CLT", "% Tabela A – RCA", "% Tabela B – RCA".
// Sem valores preenchidos de fábrica; produto sem percentual completo aparece destacado.
// Opção de aplicar o mesmo percentual a vários produtos de uma vez.
import React, { useEffect, useMemo, useState } from 'react'
import type { Produto, Vendedor } from '../types'
import {
  ComissaoProduto,
  fetchComissaoProdutos,
  salvarComissaoProduto,
} from '../lib/comissao'

const COLS = [
  { key: 'pctAClt' as const, label: '% Tabela A – CLT' },
  { key: 'pctBClt' as const, label: '% Tabela B – CLT' },
  { key: 'pctARca' as const, label: '% Tabela A – RCA' },
  { key: 'pctBRca' as const, label: '% Tabela B – RCA' },
]

type Linha = { pctAClt: string; pctBClt: string; pctARca: string; pctBRca: string }

function paraNumero(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function ParametrosComissao({ produtos, loggedUser, showToast }: {
  produtos: Produto[]
  loggedUser: Vendedor
  showToast: (tipo: 'success' | 'error', texto: string) => void
}) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [linhas, setLinhas] = useState<Map<number, Linha>>(new Map())
  const [sujas, setSujas] = useState<Set<number>>(new Set())
  const [busca, setBusca] = useState('')
  const [loteColuna, setLoteColuna] = useState<(typeof COLS)[number]['key']>('pctAClt')
  const [loteValor, setLoteValor] = useState('')
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())

  const produtosAtivos = useMemo(
    () => produtos.filter(p => p.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)),
    [produtos]
  )

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const rows = await fetchComissaoProdutos()
        if (!vivo) return
        const map = new Map<number, Linha>()
        const byId = new Map(rows.map(r => [r.produtoId, r]))
        for (const p of produtosAtivos) {
          const c = byId.get(p.id)
          map.set(p.id, {
            pctAClt: c?.pctAClt != null ? String(c.pctAClt) : '',
            pctBClt: c?.pctBClt != null ? String(c.pctBClt) : '',
            pctARca: c?.pctARca != null ? String(c.pctARca) : '',
            pctBRca: c?.pctBRca != null ? String(c.pctBRca) : '',
          })
        }
        setLinhas(map)
      } catch (err: any) {
        showToast('error', `Erro ao carregar comissões: ${err?.message || 'falha de rede'}`)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [produtosAtivos]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return produtosAtivos
    return produtosAtivos.filter(p =>
      p.nome.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }, [produtosAtivos, busca])

  const incompleto = (id: number): boolean => {
    const l = linhas.get(id)
    if (!l) return true
    return [l.pctAClt, l.pctBClt, l.pctARca, l.pctBRca].some(v => v.trim() === '')
  }

  const alterar = (id: number, key: keyof Linha, valor: string) => {
    if (!/^[0-9]*[.,]?[0-9]*$/.test(valor)) return
    setLinhas(prev => {
      const m = new Map(prev)
      m.set(id, { ...(m.get(id) || { pctAClt: '', pctBClt: '', pctARca: '', pctBRca: '' }), [key]: valor })
      return m
    })
    setSujas(prev => new Set(prev).add(id))
  }

  const aplicarEmLote = () => {
    const v = loteValor.trim()
    if (!v || !/^[0-9]*[.,]?[0-9]*$/.test(v)) {
      showToast('error', 'Informe um percentual válido para aplicar em lote.')
      return
    }
    const alvos = selecionados.size > 0 ? [...selecionados] : filtrados.map(p => p.id)
    if (alvos.length === 0) return
    if (!confirm(`Aplicar ${v}% na coluna "${COLS.find(c => c.key === loteColuna)?.label}" para ${alvos.length} produto(s)?`)) return
    setLinhas(prev => {
      const m = new Map(prev)
      for (const id of alvos) {
        m.set(id, { ...(m.get(id) || { pctAClt: '', pctBClt: '', pctARca: '', pctBRca: '' }), [loteColuna]: v })
      }
      return m
    })
    setSujas(prev => {
      const s = new Set(prev)
      alvos.forEach(id => s.add(id))
      return s
    })
    showToast('success', `Percentual aplicado a ${alvos.length} produto(s). Clique em Salvar para confirmar.`)
  }

  const salvar = async () => {
    if (sujas.size === 0 || salvando) return
    setSalvando(true)
    const usuario = loggedUser.nome || loggedUser.email || 'Gerente'
    let ok = 0
    const erros: string[] = []
    for (const id of sujas) {
      const l = linhas.get(id)!
      try {
        await salvarComissaoProduto(id, {
          pctAClt: paraNumero(l.pctAClt),
          pctBClt: paraNumero(l.pctBClt),
          pctARca: paraNumero(l.pctARca),
          pctBRca: paraNumero(l.pctBRca),
        }, usuario)
        ok++
      } catch (err: any) {
        erros.push(`${produtosAtivos.find(p => p.id === id)?.nome || id}: ${err?.message || 'erro'}`)
      }
    }
    setSalvando(false)
    if (erros.length === 0) {
      setSujas(new Set())
      showToast('success', `Comissões salvas (${ok} produto(s)). Alterações valem daqui para frente — pedidos já confirmados mantêm o percentual da época.`)
    } else {
      setSujas(new Set(erros.map(() => 0))) // mantém marcado para revisão
      showToast('error', `Falha ao salvar: ${erros[0]}`)
    }
  }

  const alternarSelecionado = (id: number) => {
    setSelecionados(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  if (carregando) {
    return <div className="p-6 text-sm text-gray-500">Carregando percentuais de comissão...</div>
  }

  const nIncompletos = produtosAtivos.filter(p => incompleto(p.id)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Comissão por produto</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Percentual de comissão por produto, conforme a tabela de preço usada no pedido (A ou B) e o tipo do vendedor (CLT ou RCA).
            Alteração vale daqui para frente: pedidos já confirmados mantêm o percentual da época.
          </p>
          {nIncompletos > 0 && (
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 inline-block">
              {nIncompletos} produto(s) sem percentual completo — a comissão fica incompleta enquanto houver produto sem percentual.
            </p>
          )}
        </div>
        <button
          onClick={salvar}
          disabled={sujas.size === 0 || salvando}
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors self-start"
        >
          {salvando ? 'Salvando...' : sujas.size > 0 ? `Salvar alterações (${sujas.size})` : 'Tudo salvo'}
        </button>
      </div>

      {/* Aplicação em lote */}
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Coluna</label>
          <select value={loteColuna} onChange={e => setLoteColuna(e.target.value as any)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 dark:text-gray-100">
            {COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Percentual (%)</label>
          <input value={loteValor} onChange={e => setLoteValor(e.target.value)} placeholder="ex: 3"
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 w-24 bg-white dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <button onClick={aplicarEmLote}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 text-white hover:bg-gray-900 transition-colors">
          Aplicar {selecionados.size > 0 ? `aos ${selecionados.size} selecionados` : `a todos os filtrados (${filtrados.length})`}
        </button>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto ou SKU..."
          className="ml-auto text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-56 bg-white dark:bg-gray-800 dark:text-gray-100" />
      </div>

      {/* Tabela de produtos */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
            <tr>
              <th className="p-2 w-8"></th>
              <th className="text-left p-2 font-semibold text-gray-600 dark:text-gray-300">Produto</th>
              {COLS.map(c => (
                <th key={c.key} className="p-2 font-semibold text-gray-600 dark:text-gray-300 text-center w-28">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(p => {
              const l = linhas.get(p.id) || { pctAClt: '', pctBClt: '', pctARca: '', pctBRca: '' }
              const inc = incompleto(p.id)
              const suja = sujas.has(p.id)
              return (
                <tr key={p.id} className={`border-t border-gray-100 dark:border-gray-800 ${inc ? 'bg-amber-50/60 dark:bg-amber-900/20' : ''} ${suja ? 'outline outline-1 outline-primary-300' : ''}`}>
                  <td className="p-2 text-center">
                    <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternarSelecionado(p.id)} />
                  </td>
                  <td className="p-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100 leading-tight">{p.nome}</p>
                    {p.sku && <p className="text-[11px] text-gray-400 font-mono">{p.sku}</p>}
                  </td>
                  {COLS.map(c => (
                    <td key={c.key} className="p-1.5 text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <input
                          value={l[c.key]}
                          onChange={e => alterar(p.id, c.key, e.target.value)}
                          placeholder="—"
                          className={`w-16 text-center text-sm border rounded-lg px-1 py-1 bg-white dark:bg-gray-800 dark:text-gray-100 ${
                            l[c.key].trim() === '' ? 'border-amber-400' : 'border-gray-300'
                          }`}
                        />
                        <span className="text-[11px] text-gray-400">%</span>
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        Linhas destacadas em âmbar estão sem percentual completo. Toda alteração registra quem alterou, quando, valor antigo e novo.
      </p>
    </div>
  )
}
