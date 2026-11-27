// Item 4.2 — Parâmetros > Metas
// Grade de meta mensal por vendedor (somente vendedores ativos, exclui gerente),
// com seletor de mês/ano, colunas editáveis, total da equipe no rodapé,
// botão "copiar do mês anterior" (só preenche — o usuário revisa e salva)
// e calendário de feriados editável (dias úteis = seg-sex exceto feriados).
// Toda alteração grava em metas_vendedor_log (quem, quando, valor antigo/novo).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Vendedor } from '../types'
import {
  adicionarFeriado,
  diasUteisMes,
  Feriado,
  fetchFeriados,
  fetchMetasMes,
  MetaVendedorMes,
  removerFeriado,
  salvarMetasMes,
  somaMetasEquipe,
} from '../lib/metas'

const COLS = [
  { key: 'metaFaturamento' as const, label: 'Faturamento (R$)' },
  { key: 'metaVolumeKg' as const, label: 'Volume (kg)' },
  { key: 'metaVisitas' as const, label: 'Visitas' },
  { key: 'metaPropostas' as const, label: 'Propostas' },
  { key: 'metaNovosClientes' as const, label: 'Novos clientes' },
]

type LinhaEdicao = Record<(typeof COLS)[number]['key'], string>

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function paraNumero(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function linhaVazia(): LinhaEdicao {
  return { metaFaturamento: '', metaVolumeKg: '', metaVisitas: '', metaPropostas: '', metaNovosClientes: '' }
}

function linhaDeMeta(m?: MetaVendedorMes): LinhaEdicao {
  if (!m) return linhaVazia()
  return {
    metaFaturamento: m.metaFaturamento != null ? String(m.metaFaturamento) : '',
    metaVolumeKg: m.metaVolumeKg != null ? String(m.metaVolumeKg) : '',
    metaVisitas: m.metaVisitas != null ? String(m.metaVisitas) : '',
    metaPropostas: m.metaPropostas != null ? String(m.metaPropostas) : '',
    metaNovosClientes: m.metaNovosClientes != null ? String(m.metaNovosClientes) : '',
  }
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function ParametrosMetas({ vendedores, loggedUser, showToast }: {
  vendedores: Vendedor[]
  loggedUser: Vendedor
  showToast: (tipo: 'success' | 'error', texto: string) => void
}) {
  const agora = new Date()
  const [ano, setAno] = useState(agora.getFullYear())
  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [copiando, setCopiando] = useState(false)
  const [linhas, setLinhas] = useState<Map<number, LinhaEdicao>>(new Map())
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [novaDataFeriado, setNovaDataFeriado] = useState('')
  const [novaDescricaoFeriado, setNovaDescricaoFeriado] = useState('')

  // Somente vendedores ativos; gerente não carrega meta de vendas própria na grade da equipe
  const vendedoresAtivos = useMemo(
    () => vendedores.filter(v => v.ativo && v.cargo !== 'gerente').sort((a, b) => a.nome.localeCompare(b.nome)),
    [vendedores]
  )

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [metas, fer] = await Promise.all([fetchMetasMes(ano, mes), fetchFeriados()])
      const porVend = new Map(metas.map(m => [m.vendedorId, m]))
      const map = new Map<number, LinhaEdicao>()
      for (const v of vendedoresAtivos) map.set(v.id, linhaDeMeta(porVend.get(v.id)))
      setLinhas(map)
      setFeriados(fer)
    } catch (err: any) {
      showToast('error', `Erro ao carregar metas: ${err?.message || 'falha de rede'}`)
    } finally {
      setCarregando(false)
    }
  }, [ano, mes, vendedoresAtivos]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar() }, [carregar])

  const alterarCelula = (vendedorId: number, campo: keyof LinhaEdicao, valor: string) => {
    setLinhas(prev => {
      const next = new Map(prev)
      const linha = { ...(next.get(vendedorId) || linhaVazia()), [campo]: valor }
      next.set(vendedorId, linha)
      return next
    })
  }

  // Meta da equipe = soma das metas dos vendedores ativos (rodapé da grade)
  const totais = useMemo(() => {
    const metas: MetaVendedorMes[] = []
    for (const v of vendedoresAtivos) {
      const l = linhas.get(v.id)
      if (!l) continue
      metas.push({
        vendedorId: v.id, ano, mes,
        metaFaturamento: paraNumero(l.metaFaturamento),
        metaVolumeKg: paraNumero(l.metaVolumeKg),
        metaVisitas: paraNumero(l.metaVisitas),
        metaPropostas: paraNumero(l.metaPropostas),
        metaNovosClientes: paraNumero(l.metaNovosClientes),
      })
    }
    return somaMetasEquipe(metas)
  }, [linhas, vendedoresAtivos, ano, mes])

  const handleSalvar = async () => {
    if (salvando) return
    setSalvando(true)
    try {
      const novas: MetaVendedorMes[] = vendedoresAtivos.map(v => {
        const l = linhas.get(v.id) || linhaVazia()
        return {
          vendedorId: v.id, ano, mes,
          metaFaturamento: paraNumero(l.metaFaturamento),
          metaVolumeKg: paraNumero(l.metaVolumeKg),
          metaVisitas: paraNumero(l.metaVisitas),
          metaPropostas: paraNumero(l.metaPropostas),
          metaNovosClientes: paraNumero(l.metaNovosClientes),
        }
      })
      const usuario = loggedUser.nome || loggedUser.email || 'Gerente'
      const r = await salvarMetasMes(ano, mes, novas, usuario)
      showToast('success', `Metas de ${MESES_PT[mes - 1]}/${ano} salvas! ${r.alterados} alteração(ões) registrada(s) no log.`)
    } catch (err: any) {
      showToast('error', `Erro ao salvar metas: ${err?.message || 'falha de rede'}`)
    } finally {
      setSalvando(false)
    }
  }

  // Copiar do mês anterior: preenche a grade com os valores do mês anterior,
  // mas NÃO salva — o usuário revisa e clica em Salvar (item 4.2).
  const handleCopiarMesAnterior = async () => {
    if (copiando) return
    setCopiando(true)
    try {
      const mesAnt = mes === 1 ? 12 : mes - 1
      const anoAnt = mes === 1 ? ano - 1 : ano
      const metasAnt = await fetchMetasMes(anoAnt, mesAnt)
      if (metasAnt.length === 0) {
        showToast('error', `Não há metas cadastradas em ${MESES_PT[mesAnt - 1]}/${anoAnt} para copiar.`)
        return
      }
      const porVend = new Map(metasAnt.map(m => [m.vendedorId, m]))
      setLinhas(prev => {
        const next = new Map(prev)
        for (const v of vendedoresAtivos) {
          const ant = porVend.get(v.id)
          if (ant) next.set(v.id, linhaDeMeta(ant))
        }
        return next
      })
      showToast('success', `Grade preenchida com os valores de ${MESES_PT[mesAnt - 1]}/${anoAnt}. Revise e clique em Salvar.`)
    } catch (err: any) {
      showToast('error', `Erro ao copiar metas: ${err?.message || 'falha de rede'}`)
    } finally {
      setCopiando(false)
    }
  }

  const handleAdicionarFeriado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novaDataFeriado || salvando) return
    setSalvando(true)
    try {
      await adicionarFeriado(novaDataFeriado, novaDescricaoFeriado.trim())
      setNovaDataFeriado('')
      setNovaDescricaoFeriado('')
      setFeriados(await fetchFeriados())
      showToast('success', 'Feriado adicionado. Os dias úteis passam a descontá-lo.')
    } catch (err: any) {
      showToast('error', `Erro ao adicionar feriado: ${err?.message || 'falha de rede'}`)
    } finally {
      setSalvando(false)
    }
  }

  const handleRemoverFeriado = async (data: string) => {
    if (salvando) return
    setSalvando(true)
    try {
      await removerFeriado(data)
      setFeriados(await fetchFeriados())
      showToast('success', 'Feriado removido.')
    } catch (err: any) {
      showToast('error', `Erro ao remover feriado: ${err?.message || 'falha de rede'}`)
    } finally {
      setSalvando(false)
    }
  }

  const anos = useMemo(() => {
    const base = agora.getFullYear()
    return [base - 1, base, base + 1]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const duMes = diasUteisMes(ano, mes, feriados)

  return (
    <div className="space-y-6">
      {/* Grade de metas mensais por vendedor */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Metas mensais por vendedor</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Defina as metas de cada mês. A meta da equipe é a soma das metas dos vendedores ativos.
              Cada alteração salva fica registrada no log de auditoria.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MESES_PT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={ano}
              onChange={e => setAno(Number(e.target.value))}
              className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              type="button"
              onClick={handleCopiarMesAnterior}
              disabled={copiando || carregando}
              className="px-3 py-1.5 text-xs font-semibold rounded-apple border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 disabled:opacity-50"
              title="Preenche a grade com os valores do mês anterior (revise e salve)"
            >
              {copiando ? 'Copiando...' : 'Copiar do mês anterior'}
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || carregando}
              className="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-apple text-xs font-semibold"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          {MESES_PT[mes - 1]}/{ano} tem <span className="font-semibold text-gray-600 dark:text-gray-300">{duMes} dias úteis</span> (seg-sex exceto feriados cadastrados abaixo).
        </p>

        {carregando ? (
          <p className="text-sm text-gray-400 py-6 text-center">Carregando metas...</p>
        ) : vendedoresAtivos.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Nenhum vendedor ativo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-apple">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wide">Vendedor</th>
                  {COLS.map(c => (
                    <th key={c.key} className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wide text-right">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {vendedoresAtivos.map(v => {
                  const l = linhas.get(v.id) || linhaVazia()
                  return (
                    <tr key={v.id} className="bg-white dark:bg-gray-900">
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.nome}</td>
                      {COLS.map(c => (
                        <td key={c.key} className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l[c.key]}
                            onChange={e => alterarCelula(v.id, c.key, e.target.value)}
                            placeholder="—"
                            className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800 font-bold">
                  <td className="px-3 py-2 text-xs uppercase tracking-wide text-gray-600 dark:text-gray-300">Meta da equipe</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{fmtBRL(totais.metaFaturamento)}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{fmtNum(totais.metaVolumeKg)}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{totais.metaVisitas}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{totais.metaPropostas}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{totais.metaNovosClientes}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Calendário de feriados (dias úteis: segunda a sexta, exceto estes) */}
      <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-5">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Feriados — calendário de dias úteis</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Os dias úteis do sistema são de segunda a sexta, exceto os feriados cadastrados aqui.
            Eles afetam a meta da semana e o ritmo diário calculados no Dashboard e em Relatórios.
          </p>
        </div>
        <form onSubmit={handleAdicionarFeriado} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Data</label>
            <input
              type="date"
              value={novaDataFeriado}
              onChange={e => setNovaDataFeriado(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Descrição</label>
            <input
              type="text"
              value={novaDescricaoFeriado}
              onChange={e => setNovaDescricaoFeriado(e.target.value)}
              placeholder="Ex.: Natal, Aniversário da cidade..."
              className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="submit"
            disabled={!novaDataFeriado || salvando}
            className="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-apple text-sm font-semibold"
          >
            + Adicionar
          </button>
        </form>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-apple overflow-hidden max-h-72 overflow-y-auto">
          {feriados.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400 text-center">Nenhum feriado cadastrado. Dias úteis = toda segunda a sexta.</p>
          ) : (
            feriados.map(f => (
              <div key={f.data} className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-gray-900">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {f.data.split('-').reverse().join('/')}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">{f.descricao || 'Feriado'}</span>
                </div>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => handleRemoverFeriado(f.data)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-apple bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
