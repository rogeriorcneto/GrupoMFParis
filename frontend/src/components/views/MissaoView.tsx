import React, { useEffect, useMemo, useState } from 'react'
import { MapIcon, PlusIcon, ArrowPathIcon, ChevronLeftIcon, CalendarIcon, UserGroupIcon, CurrencyDollarIcon, CheckCircleIcon, MapPinIcon, FlagIcon } from '@heroicons/react/24/outline'
import { authFetch } from '../../lib/botApi'
import type { Missao, MissaoDespesa, Tarefa, Cliente, Vendedor } from '../../types'

const BOT_URL = (import.meta as any).env?.VITE_BOT_URL || 'http://localhost:3002'

interface Props {
  clientes: Cliente[]
  vendedores: Vendedor[]
  loggedUser: Vendedor | null
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

function api(path: string, opts?: RequestInit) {
  return authFetch(`${BOT_URL}${path}`, { ...opts, headers: { ...(opts?.headers || {}), 'Content-Type': 'application/json' } }).then(r => r.json())
}

export default function MissaoView({ clientes, vendedores, loggedUser, showToast }: Props) {
  const [missoes, setMissoes] = useState<Missao[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ nome: '', objetivo: '', vendedorId: '', dataSaida: '', dataRetorno: '', veiculo: '', hotel: '', cidades: '', custoEstimado: '' })
  const [criando, setCriando] = useState(false)
  const [detalhe, setDetalhe] = useState<{ missao: Missao; tarefas: Tarefa[]; despesas: MissaoDespesa[] } | null>(null)
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [despesa, setDespesa] = useState({ tipo: 'combustivel', valor: '', data: '', observacao: '' })
  const [resultado, setResultado] = useState({ interesse: 'interessado', produtos: '', proximos: '', amostras: 0 } as any)

  const isGerente = loggedUser?.cargo === 'gerente'

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/api/missoes')
      setMissoes(r.data || [])
    } catch (e: any) {
      showToast?.('error', e.message || 'Erro ao carregar missões')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [loggedUser?.id])

  const salvar = async () => {
    if (!form.nome || !form.dataSaida || !form.dataRetorno) { showToast?.('error', 'Preencha nome, data de saída e retorno'); return }
    const vendedorId = isGerente ? Number(form.vendedorId || loggedUser?.id) : loggedUser?.id
    const body = {
      nome: form.nome,
      objetivo: form.objetivo,
      vendedorId,
      dataSaida: form.dataSaida,
      dataRetorno: form.dataRetorno,
      veiculo: form.veiculo,
      hotel: form.hotel,
      cidades: form.cidades.split(',').map(s => s.trim()).filter(Boolean),
      custoEstimado: form.custoEstimado ? Number(form.custoEstimado) : 0,
    }
    try {
      const r = await api('/api/missoes', { method: 'POST', body: JSON.stringify(body) })
      if (r.success) { showToast?.('success', 'Missão criada'); setCriando(false); setForm({ ...form, nome: '', objetivo: '', cidades: '', custoEstimado: '', veiculo: '', hotel: '' }); load() }
      else showToast?.('error', r.error || 'Erro')
    } catch (e: any) { showToast?.('error', e.message || 'Erro') }
  }

  const abrir = async (m: Missao) => {
    const r = await api(`/api/missoes/${m.id}`)
    if (r.success) setDetalhe(r.data)
  }

  const iniciar = async (m: Missao) => {
    const r = await api(`/api/missoes/${m.id}/iniciar`, { method: 'POST' })
    if (r.success) { showToast?.('success', 'Missão iniciada'); load(); if (detalhe && detalhe.missao.id === m.id) abrir(m) }
    else showToast?.('error', r.error || 'Erro')
  }

  const concluir = async (m: Missao) => {
    const r = await api(`/api/missoes/${m.id}/concluir`, { method: 'POST' })
    if (r.success) { showToast?.('success', 'Missão concluída'); load(); if (detalhe && detalhe.missao.id === m.id) abrir(m) }
    else showToast?.('error', r.error || 'Erro')
  }

  const gerarRoteiro = async () => {
    if (!detalhe || selecionados.length === 0) return
    const dataBase = detalhe.missao.dataSaida
    const visitas = selecionados.map((clienteId, idx) => ({
      clienteId,
      titulo: `Visita - ${clientes.find(c => c.id === clienteId)?.razaoSocial || 'Cliente'}`,
      data: dataBase,
      dia: 1,
      ordem: idx + 1,
    }))
    const r = await api(`/api/missoes/${detalhe.missao.id}/roteiro`, { method: 'POST', body: JSON.stringify({ visitas }) })
    if (r.success) { showToast?.('success', 'Roteiro criado'); setSelecionados([]); abrir(detalhe.missao) }
    else showToast?.('error', r.error || 'Erro')
  }

  const check = async (t: Tarefa, tipo: 'checkin' | 'checkout') => {
    const cb = (pos: GeolocationPosition) => {
      const body = { location: { lat: pos.coords.latitude, lon: pos.coords.longitude } }
      api(`/api/missoes/tarefas/${t.id}/${tipo}`, { method: 'POST', body: JSON.stringify(body) })
        .then(() => { showToast?.('success', tipo === 'checkin' ? 'Check-in registrado' : 'Check-out registrado'); if (detalhe) abrir(detalhe.missao) })
        .catch((e: any) => showToast?.('error', e.message || 'Erro'))
    }
    navigator.geolocation.getCurrentPosition(cb, (e) => showToast?.('error', 'GPS indisponível'))
  }

  const checkoutComDados = async (t: Tarefa) => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const body = {
        location: { lat: pos.coords.latitude, lon: pos.coords.longitude },
        resultado: resultado[t.id]?.resultado || '',
        interesse: resultado[t.id]?.interesse || 'interessado',
        produtosApresentados: (resultado[t.id]?.produtos || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        proximosPassos: resultado[t.id]?.proximos || '',
        amostrasEntregues: Number(resultado[t.id]?.amostras || 0),
      }
      api(`/api/missoes/tarefas/${t.id}/checkout`, { method: 'POST', body: JSON.stringify(body) })
        .then(() => { showToast?.('success', 'Check-out registrado'); setResultado((r: any) => ({ ...r, [t.id]: undefined })); if (detalhe) abrir(detalhe.missao) })
        .catch((e: any) => showToast?.('error', e.message || 'Erro'))
    }, () => showToast?.('error', 'GPS indisponível'))
  }

  const addDespesa = async () => {
    if (!detalhe || !despesa.valor || !despesa.data) { showToast?.('error', 'Preencha valor e data'); return }
    const body = { tipo: despesa.tipo, valor: Number(despesa.valor), data: despesa.data, observacao: despesa.observacao }
    const r = await api(`/api/missoes/${detalhe.missao.id}/despesas`, { method: 'POST', body: JSON.stringify(body) })
    if (r.success) { showToast?.('success', 'Despesa adicionada'); setDespesa({ tipo: 'combustivel', valor: '', data: '', observacao: '' }); abrir(detalhe.missao) }
    else showToast?.('error', r.error || 'Erro')
  }

  const clientesOptions = useMemo(() => clientes.filter(c => loggedUser?.cargo === 'gerente' || c.vendedorId === loggedUser?.id), [clientes, loggedUser])

  const badge = (s: string) => {
    const map: Record<string, string> = { planejada: 'bg-gray-100 text-gray-700', em_andamento: 'bg-blue-100 text-blue-700', concluida: 'bg-green-100 text-green-700', cancelada: 'bg-red-100 text-red-700' }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] || map.planejada}`}>{s.replace('_', ' ')}</span>
  }

  if (detalhe) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <button onClick={() => setDetalhe(null)} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"><ChevronLeftIcon className="h-4 w-4 mr-1" /> Voltar</button>
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center"><FlagIcon className="h-6 w-6 mr-2 text-primary-600" /> {detalhe.missao.nome}</h1>
            <div className="flex gap-2">{badge(detalhe.missao.status)}</div>
          </div>
          <p className="text-gray-600 mt-1">{detalhe.missao.objetivo}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3"><CalendarIcon className="h-4 w-4 mb-1 text-gray-500" /><p className="font-medium">Saída</p><p>{detalhe.missao.dataSaida}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><CalendarIcon className="h-4 w-4 mb-1 text-gray-500" /><p className="font-medium">Retorno</p><p>{detalhe.missao.dataRetorno}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><MapPinIcon className="h-4 w-4 mb-1 text-gray-500" /><p className="font-medium">Cidades</p><p>{detalhe.missao.cidades?.join(', ') || '-'}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><CurrencyDollarIcon className="h-4 w-4 mb-1 text-gray-500" /><p className="font-medium">Custo estimado</p><p>R$ {detalhe.missao.custoEstimado?.toLocaleString('pt-BR') || 0}</p></div>
          </div>
          {detalhe.missao.status === 'planejada' && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => iniciar(detalhe.missao)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">Iniciar missão</button>
            </div>
          )}
          {detalhe.missao.status === 'em_andamento' && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => concluir(detalhe.missao)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Concluir missão</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center"><MapIcon className="h-5 w-5 mr-2" /> Roteiro / Visitas</h2>
            {detalhe.missao.status === 'planejada' && (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 block mb-1">Selecione clientes para visitar</label>
                <select multiple value={selecionados.map(String)} onChange={(e) => setSelecionados(Array.from(e.target.selectedOptions).map(o => Number(o.value)))} className="w-full border rounded-lg p-2 text-sm h-32">
                  {clientesOptions.map(c => <option key={c.id} value={c.id}>{c.razaoSocial}</option>)}
                </select>
                <button onClick={gerarRoteiro} disabled={selecionados.length === 0} className="mt-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">Gerar roteiro</button>
              </div>
            )}
            <div className="space-y-3">
              {detalhe.tarefas.map(t => (
                <div key={t.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">{t.titulo}</p>
                      <p className="text-xs text-gray-500">{t.data} {t.hora}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'concluida' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{t.status}</span>
                  </div>
                  {t.status !== 'concluida' && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <button onClick={() => check(t, 'checkin')} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Check-in</button>
                      <button onClick={() => setResultado((r: any) => ({ ...r, [t.id]: r?.[t.id] ? undefined : {} }))} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Check-out</button>
                    </div>
                  )}
                  {resultado[t.id] !== undefined && (
                    <div className="mt-3 space-y-2 border-t pt-2">
                      <textarea placeholder="Resultado da visita" value={resultado[t.id]?.resultado || ''} onChange={e => setResultado((r: any) => ({ ...r, [t.id]: { ...r?.[t.id], resultado: e.target.value } }))} className="w-full border rounded p-2 text-sm" />
                      <select value={resultado[t.id]?.interesse || 'interessado'} onChange={e => setResultado((r: any) => ({ ...r, [t.id]: { ...r?.[t.id], interesse: e.target.value } }))} className="w-full border rounded p-2 text-sm">
                        <option value="muito_interessado">Muito interessado</option>
                        <option value="interessado">Interessado</option>
                        <option value="pouco">Pouco</option>
                        <option value="nao">Não</option>
                      </select>
                      <input placeholder="Produtos apresentados (vírgulas)" value={resultado[t.id]?.produtos || ''} onChange={e => setResultado((r: any) => ({ ...r, [t.id]: { ...r?.[t.id], produtos: e.target.value } }))} className="w-full border rounded p-2 text-sm" />
                      <input placeholder="Próximos passos" value={resultado[t.id]?.proximos || ''} onChange={e => setResultado((r: any) => ({ ...r, [t.id]: { ...r?.[t.id], proximos: e.target.value } }))} className="w-full border rounded p-2 text-sm" />
                      <input type="number" placeholder="Amostras entregues" value={resultado[t.id]?.amostras || 0} onChange={e => setResultado((r: any) => ({ ...r, [t.id]: { ...r?.[t.id], amostras: e.target.value } }))} className="w-full border rounded p-2 text-sm" />
                      <button onClick={() => checkoutComDados(t)} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700">Confirmar check-out</button>
                    </div>
                  )}
                </div>
              ))}
              {detalhe.tarefas.length === 0 && <p className="text-sm text-gray-400">Nenhuma tarefa criada.</p>}
            </div>
          </div>

          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center"><CurrencyDollarIcon className="h-5 w-5 mr-2" /> Despesas</h2>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <select value={despesa.tipo} onChange={e => setDespesa({ ...despesa, tipo: e.target.value })} className="border rounded p-2 text-sm">
                <option value="combustivel">Combustível</option>
                <option value="pedagio">Pedágio</option>
                <option value="hotel">Hotel</option>
                <option value="alimentacao">Alimentação</option>
                <option value="estacionamento">Estacionamento</option>
                <option value="outro">Outro</option>
              </select>
              <input type="number" placeholder="Valor" value={despesa.valor} onChange={e => setDespesa({ ...despesa, valor: e.target.value })} className="border rounded p-2 text-sm" />
              <input type="date" value={despesa.data} onChange={e => setDespesa({ ...despesa, data: e.target.value })} className="border rounded p-2 text-sm" />
            </div>
            <input placeholder="Observação" value={despesa.observacao} onChange={e => setDespesa({ ...despesa, observacao: e.target.value })} className="w-full border rounded p-2 text-sm mb-2" />
            <button onClick={addDespesa} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">Adicionar despesa</button>
            <div className="mt-4 space-y-2">
              {detalhe.despesas.map(d => (
                <div key={d.id} className="flex justify-between text-sm border-b py-1">
                  <span className="capitalize text-gray-600">{d.tipo}</span>
                  <span className="font-medium">R$ {d.valor.toLocaleString('pt-BR')} <span className="text-gray-400">({d.data})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center"><FlagIcon className="h-7 w-7 mr-2 text-primary-600" /> Missões Comerciais</h1>
        <button onClick={() => setCriando(true)} className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"><PlusIcon className="h-4 w-4 mr-1" /> Nova missão</button>
      </div>

      {criando && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Nova missão</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Nome da missão" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            <input placeholder="Objetivo" value={form.objetivo} onChange={e => setForm({ ...form, objetivo: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            {isGerente && (
              <select value={form.vendedorId} onChange={e => setForm({ ...form, vendedorId: e.target.value })} className="border rounded-lg p-2.5 text-sm">
                <option value="">Vendedor</option>
                {vendedores.filter(v => v.ativo).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            )}
            <input type="date" value={form.dataSaida} onChange={e => setForm({ ...form, dataSaida: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            <input type="date" value={form.dataRetorno} onChange={e => setForm({ ...form, dataRetorno: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            <input placeholder="Veículo" value={form.veiculo} onChange={e => setForm({ ...form, veiculo: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            <input placeholder="Hotel" value={form.hotel} onChange={e => setForm({ ...form, hotel: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            <input placeholder="Cidades (separadas por vírgula)" value={form.cidades} onChange={e => setForm({ ...form, cidades: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
            <input type="number" placeholder="Custo estimado" value={form.custoEstimado} onChange={e => setForm({ ...form, custoEstimado: e.target.value })} className="border rounded-lg p-2.5 text-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={salvar} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">Salvar</button>
            <button onClick={() => setCriando(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center"><UserGroupIcon className="h-5 w-5 mr-2" /> Missões</h2>
          <button onClick={load} className="p-1 text-gray-500 hover:text-gray-700"><ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="divide-y">
          {missoes.map(m => (
            <div key={m.id} onClick={() => abrir(m)} className="p-4 hover:bg-gray-50 cursor-pointer transition flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{m.nome}</p>
                <p className="text-sm text-gray-500">{m.dataSaida} → {m.dataRetorno} · {m.cidades?.join(', ') || '-'}</p>
              </div>
              <div className="flex items-center gap-3">
                {badge(m.status)}
                <ChevronLeftIcon className="h-4 w-4 text-gray-400 -rotate-180" />
              </div>
            </div>
          ))}
          {missoes.length === 0 && !loading && <p className="p-4 text-sm text-gray-400">Nenhuma missão encontrada.</p>}
        </div>
      </div>
    </div>
  )
}
