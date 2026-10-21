import React, { useCallback, useEffect, useState } from 'react'
import { authFetch, BOT_URL } from '../../lib/botApi'
import type { Vendedor } from '../../types'

interface Protocolo {
  numero: string
  titulo: string
  descricao: string
  severidade: 'critico' | 'normal'
  status: 'aberto' | 'em_atendimento' | 'resolvido'
  vendedorId: number | null
  autorNome: string
  criadoEm: string
  atendidoEm?: string
  resolvidoEm?: string
  resposta?: string
  slaAtendimentoEstourado: boolean
  slaCorrecaoEstourado: boolean
}

interface Props {
  loggedUser: Vendedor | null
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

const statusStyle: Record<Protocolo['status'], string> = {
  aberto: 'bg-red-100 text-red-700 border-red-300',
  em_atendimento: 'bg-amber-100 text-amber-700 border-amber-300',
  resolvido: 'bg-green-100 text-green-700 border-green-300',
}

const statusLabel: Record<Protocolo['status'], string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
}

export default function ProtocolosView({ loggedUser, showToast }: Props) {
  const isGerente = loggedUser?.cargo === 'gerente'
  const [protocolos, setProtocolos] = useState<Protocolo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [severidade, setSeveridade] = useState<'critico' | 'normal'>('normal')
  const [respostaEdit, setRespostaEdit] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${BOT_URL}/api/protocolos`)
      const j = await res.json()
      if (j.success) setProtocolos(j.protocolos)
    } catch {
      showToast?.('error', 'Erro ao carregar protocolos')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { carregar() }, [carregar])

  const abrir = async () => {
    if (!titulo.trim() || !descricao.trim()) {
      showToast?.('error', 'Preencha título e descrição')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/protocolos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, descricao, severidade }),
      })
      const j = await res.json()
      if (j.success) {
        showToast?.('success', `Protocolo ${j.protocolo.numero} aberto`)
        setTitulo(''); setDescricao(''); setSeveridade('normal'); setShowForm(false)
        carregar()
      } else {
        showToast?.('error', j.error || 'Erro ao abrir protocolo')
      }
    } catch {
      showToast?.('error', 'Erro ao abrir protocolo')
    } finally {
      setSaving(false)
    }
  }

  const atualizar = async (numero: string, status?: string) => {
    try {
      const res = await authFetch(`${BOT_URL}/api/protocolos/${numero}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resposta: respostaEdit[numero] }),
      })
      const j = await res.json()
      if (j.success) {
        showToast?.('success', `Protocolo ${numero} atualizado`)
        carregar()
      } else {
        showToast?.('error', j.error || 'Erro ao atualizar')
      }
    } catch {
      showToast?.('error', 'Erro ao atualizar protocolo')
    }
  }

  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🐛 Protocolos de Erro</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Chamados de erro do sistema. SLA: crítico atendido em 24h e corrigido em 48h · demais em 5 dias úteis.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-apple shadow-apple-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Novo protocolo'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-5 space-y-3">
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Título do erro (ex.: Funil não carrega pedidos)"
            className="w-full px-3 py-2 rounded-apple border-2 border-gray-200 text-sm focus:border-primary-400 outline-none"
          />
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Descreva o que aconteceu, onde e como reproduzir..."
            rows={4}
            className="w-full px-3 py-2 rounded-apple border-2 border-gray-200 text-sm focus:border-primary-400 outline-none resize-none"
          />
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Severidade:</span>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" checked={severidade === 'normal'} onChange={() => setSeveridade('normal')} />
              Normal
            </label>
            <label className="flex items-center gap-1.5 text-sm text-red-700 font-medium">
              <input type="radio" checked={severidade === 'critico'} onChange={() => setSeveridade('critico')} />
              Crítico — impede o uso
            </label>
          </div>
          <button
            onClick={abrir}
            disabled={saving}
            className="px-4 py-2 rounded-apple font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Abrindo...' : 'Abrir protocolo'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
      ) : protocolos.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Nenhum protocolo aberto. 🎉</p>
      ) : (
        <div className="space-y-3">
          {protocolos.map(p => (
            <div key={p.numero} className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-gray-900">{p.numero}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusStyle[p.status]}`}>
                  {statusLabel[p.status]}
                </span>
                {p.severidade === 'critico' && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">CRÍTICO</span>
                )}
                {p.slaAtendimentoEstourado && <span className="text-xs font-semibold text-red-600">⚠️ SLA atendimento estourado</span>}
                {p.slaCorrecaoEstourado && <span className="text-xs font-semibold text-red-600">⚠️ SLA correção estourado</span>}
                <span className="ml-auto text-xs text-gray-400">{fmt(p.criadoEm)}</span>
              </div>
              <h3 className="font-semibold text-gray-900 mt-2">{p.titulo}</h3>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{p.descricao}</p>
              <p className="text-xs text-gray-400 mt-2">
                Aberto por {p.autorNome} · Atendido: {fmt(p.atendidoEm)} · Resolvido: {fmt(p.resolvidoEm)}
              </p>
              {p.resposta && (
                <div className="mt-2 bg-gray-50 rounded-apple p-3 text-sm text-gray-700">
                  <span className="font-semibold">Resposta:</span> {p.resposta}
                </div>
              )}
              {isGerente && p.status !== 'resolvido' && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <textarea
                    value={respostaEdit[p.numero] ?? p.resposta ?? ''}
                    onChange={e => setRespostaEdit(prev => ({ ...prev, [p.numero]: e.target.value }))}
                    placeholder="Resposta ao usuário (opcional)..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-apple border-2 border-gray-200 text-sm focus:border-primary-400 outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    {p.status === 'aberto' && (
                      <button onClick={() => atualizar(p.numero, 'em_atendimento')} className="px-3 py-1.5 text-xs font-semibold rounded-apple bg-amber-500 text-white hover:bg-amber-600">
                        Marcar em atendimento
                      </button>
                    )}
                    <button onClick={() => atualizar(p.numero, 'resolvido')} className="px-3 py-1.5 text-xs font-semibold rounded-apple bg-green-600 text-white hover:bg-green-700">
                      Marcar resolvido
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
