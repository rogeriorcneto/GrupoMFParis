import React, { useCallback, useEffect, useState } from 'react'
import { authFetch, BOT_URL } from '../../lib/botApi'
import type { Vendedor } from '../../types'

interface SacStatus {
  connected: boolean
  status: 'disconnected' | 'connecting' | 'qr' | 'connected'
  number: string | null
  uptime: number
}

interface Props {
  loggedUser: Vendedor | null
  showToast?: (tipo: 'success' | 'error', texto: string) => void
}

const statusLabel: Record<SacStatus['status'], string> = {
  connected: '✅ Conectado',
  connecting: '🔄 Conectando...',
  qr: '📷 Aguardando leitura do QR',
  disconnected: '⚫ Desconectado',
}

export default function SacView({ loggedUser, showToast }: Props) {
  const isGerente = loggedUser?.cargo === 'gerente'
  const [status, setStatus] = useState<SacStatus | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [template, setTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)

  const carregarStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${BOT_URL}/api/sac/status`)
      setStatus(await res.json())
      if (res.ok) {
        const qrRes = await authFetch(`${BOT_URL}/api/sac/qr`)
        const qrData = await qrRes.json()
        setQr(qrData.qr ?? null)
      }
    } catch { /* silencia — status é best-effort */ }
  }, [])

  const carregarConfig = useCallback(async () => {
    try {
      const res = await authFetch(`${BOT_URL}/api/sac/config`)
      const cfg = await res.json()
      if (typeof cfg.ativo === 'boolean') setAtivo(cfg.ativo)
      if (cfg.template) setTemplate(cfg.template)
    } catch {
      showToast?.('error', 'Erro ao carregar configuração do SAC')
    }
  }, [showToast])

  useEffect(() => {
    carregarStatus()
    carregarConfig()
    const iv = setInterval(carregarStatus, 4000)
    return () => clearInterval(iv)
  }, [carregarStatus, carregarConfig])

  const salvarConfig = async () => {
    setSaving(true)
    try {
      const res = await authFetch(`${BOT_URL}/api/sac/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo, template }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      showToast?.('success', 'Configuração do SAC salva!')
    } catch (err: any) {
      showToast?.('error', err?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const conectar = async () => {
    setActing(true)
    try {
      await authFetch(`${BOT_URL}/api/sac/connect`, { method: 'POST' })
      showToast?.('success', 'Conexão iniciada — aguarde o QR Code')
    } catch {
      showToast?.('error', 'Erro ao conectar')
    } finally {
      setActing(false)
    }
  }

  const desconectar = async () => {
    if (!window.confirm('Desconectar o WhatsApp do SAC? As pesquisas param de sair até reconectar.')) return
    setActing(true)
    try {
      await authFetch(`${BOT_URL}/api/sac/disconnect`, { method: 'POST' })
      showToast?.('success', 'SAC desconectado')
      carregarStatus()
    } catch {
      showToast?.('error', 'Erro ao desconectar')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">💬 SAC — Pesquisa de Satisfação</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quando um pedido muda para <b>entregue</b> no Omie, o número do SAC envia automaticamente
          a mensagem abaixo ao WhatsApp do cliente. A resposta (nota 1 a 5) é registrada no pedido.
        </p>
      </div>

      {/* Conexão do número SAC */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">WhatsApp do SAC</h2>
          <span className="text-sm">{statusLabel[status?.status ?? 'disconnected']}</span>
        </div>

        {status?.connected && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Número conectado: <b>+{status.number}</b>
          </p>
        )}

        {qr && (
          <div className="flex flex-col items-center gap-2 py-3">
            <img src={qr} alt="QR Code SAC" className="w-64 h-64 rounded-lg border" />
            <p className="text-xs text-gray-500">Escaneie com o WhatsApp do número dedicado ao SAC</p>
          </div>
        )}

        {isGerente && (
          <div className="flex gap-2">
            {status?.connected ? (
              <button
                onClick={desconectar}
                disabled={acting}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-sm font-medium disabled:opacity-50"
              >
                Desconectar
              </button>
            ) : (
              <button
                onClick={conectar}
                disabled={acting}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-50"
              >
                {acting ? 'Conectando...' : 'Conectar WhatsApp SAC'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Configuração da mensagem */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Mensagem de satisfação</h2>
          {isGerente && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={ativo}
                onChange={e => setAtivo(e.target.checked)}
                className="w-4 h-4 accent-green-600"
              />
              <span className={ativo ? 'text-green-600 font-medium' : 'text-gray-500'}>
                {ativo ? 'Ativo' : 'Inativo'}
              </span>
            </label>
          )}
        </div>

        <textarea
          value={template}
          onChange={e => setTemplate(e.target.value)}
          disabled={!isGerente}
          rows={7}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-3 text-sm disabled:opacity-60"
          placeholder="Mensagem enviada ao cliente após a entrega..."
        />

        <p className="text-xs text-gray-500">
          Variáveis disponíveis: <code>{'{nome}'}</code> = razão social do cliente,{' '}
          <code>{'{pedido}'}</code> = número do pedido. O cliente responde com a nota (1 a 5) e ela é
          salva como ocorrência no pedido.
        </p>

        {isGerente && (
          <button
            onClick={salvarConfig}
            disabled={saving || !template.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando...' : '💾 Salvar configuração'}
          </button>
        )}
      </div>

      {!ativo && isGerente && (
        <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          ⚠️ O SAC está <b>inativo</b> — pedidos entregues não receberão a pesquisa até você ativar.
        </p>
      )}
    </div>
  )
}
