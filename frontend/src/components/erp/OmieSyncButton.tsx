import React, { useState } from 'react'
import type { SyncResult } from '../../lib/omieSync'

interface Props {
  onSync: () => Promise<SyncResult>
  label?: string
  onComplete?: () => void
}

export default function OmieSyncButton({ onSync, label = 'Sincronizar com Omie', onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setResult(null)
    try {
      const r = await onSync()
      setResult(r)
      if (r.success && onComplete) onComplete()
      // Auto-fechar após 5s
      setTimeout(() => setResult(null), 8000)
    } catch (err: any) {
      setResult({ success: false, inseridos: 0, atualizados: 0, erros: [err?.message || String(err)] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50 shadow-md"
      >
        <span>{loading ? '🔄' : '⚡'}</span>
        {loading ? 'Sincronizando...' : label}
      </button>

      {result && (
        <div className={`absolute right-0 mt-2 w-80 rounded-lg shadow-2xl p-4 z-50 ${result.success ? 'bg-green-50 border border-green-300' : 'bg-red-50 border border-red-300'}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className={`font-bold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.success ? '✅ Sincronização concluída' : '❌ Erro na sincronização'}
              </p>
              {result.success && (
                <div className="mt-2 text-sm text-gray-700">
                  <p>📥 <strong>{result.inseridos}</strong> inseridos</p>
                  <p>🔄 <strong>{result.atualizados}</strong> atualizados</p>
                  {result.detalhes && <p className="text-xs text-gray-500 mt-1">{result.detalhes}</p>}
                </div>
              )}
              {result.erros.length > 0 && (
                <div className="mt-2 text-xs text-red-700 max-h-32 overflow-y-auto">
                  {result.erros.map((e, i) => <p key={i}>• {e}</p>)}
                </div>
              )}
            </div>
            <button onClick={() => setResult(null)} className="text-gray-400 hover:text-gray-600 ml-2">×</button>
          </div>
        </div>
      )}
    </div>
  )
}
