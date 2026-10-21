import React, { useCallback, useEffect, useState } from 'react'
import { authFetch, BOT_URL } from '../lib/botApi'

interface Ocorrencia {
  id: string
  tipo: string
  descricao: string
  autorNome: string
  criadoEm: string
}

const TIPO_LABEL: Record<string, string> = {
  atraso: 'Atraso',
  avaria: 'Avaria',
  divergencia: 'Divergência',
  reclamacao: 'Reclamação',
  entrega_parcial: 'Entrega parcial',
  pagamento: 'Pagamento',
  outro: 'Outro',
}

interface Props {
  pedidoId: number
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

/** Lista + registro de ocorrências de um pedido (Anexo I, item 5.7) */
export default function OcorrenciasPedido({ pedidoId, showToast }: Props) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('outro')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/pedidos/${pedidoId}/ocorrencias`)
      const j = await res.json()
      if (j.success) setOcorrencias(j.ocorrencias)
      else showToast?.('error', j.error || 'Erro ao carregar ocorrências')
    } catch {
      showToast?.('error', 'Erro ao carregar ocorrências')
    } finally {
      setLoading(false)
    }
  }, [pedidoId, showToast])

  useEffect(() => { carregar() }, [carregar])

  const registrar = async () => {
    if (!descricao.trim() || saving) return
    setSaving(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/pedidos/${pedidoId}/ocorrencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, descricao }),
      })
      const j = await res.json()
      if (j.success) {
        setDescricao('')
        showToast?.('success', 'Ocorrência registrada')
        carregar()
      } else {
        showToast?.('error', j.error || 'Erro ao registrar')
      }
    } catch {
      showToast?.('error', 'Erro ao registrar ocorrência')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded-lg space-y-2" onClick={e => e.stopPropagation()}>
      <p className="text-[11px] font-semibold text-orange-800">⚠️ Ocorrências do pedido</p>
      {loading ? (
        <p className="text-[11px] text-gray-400">Carregando…</p>
      ) : ocorrencias.length === 0 ? (
        <p className="text-[11px] text-gray-500">Nenhuma ocorrência registrada.</p>
      ) : (
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {ocorrencias.map(o => (
            <li key={o.id} className="bg-white rounded border border-orange-100 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold px-1 rounded bg-orange-100 text-orange-700">{TIPO_LABEL[o.tipo] || o.tipo}</span>
                <span className="text-[9px] text-gray-400">{o.autorNome} · {new Date(o.criadoEm).toLocaleString('pt-BR')}</span>
              </div>
              <p className="text-[11px] text-gray-700 mt-0.5 whitespace-pre-wrap">{o.descricao}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-1.5">
        <select value={tipo} onChange={e => setTipo(e.target.value)}
          className="text-[11px] border border-orange-200 rounded px-1 py-1 bg-white">
          {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input value={descricao} onChange={e => setDescricao(e.target.value)}
          placeholder="Descreva a ocorrência…"
          className="flex-1 text-[11px] border border-orange-200 rounded px-1.5 py-1"
          onKeyDown={e => { if (e.key === 'Enter') registrar() }} />
        <button onClick={registrar} disabled={!descricao.trim() || saving}
          className="text-[11px] font-medium px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
          {saving ? '…' : 'Registrar'}
        </button>
      </div>
    </div>
  )
}
