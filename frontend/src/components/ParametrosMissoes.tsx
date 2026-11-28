import React, { useEffect, useState } from 'react'
import { authFetch, BOT_URL } from '../lib/botApi'
import type { Vendedor } from '../types'

interface Props {
  loggedUser: Vendedor
  showToast: (tipo: 'success' | 'error', texto: string) => void
}

export interface MissaoParametrosData {
  valorKm: number
  valorDiaria: number
  raioCheckinMetros: number
  cidadeBase: string
  atualizadoPor?: string
  atualizadoEm?: string
}

export default function ParametrosMissoes({ loggedUser, showToast }: Props) {
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [valorKm, setValorKm] = useState('1.50')
  const [valorDiaria, setValorDiaria] = useState('120.00')
  const [raioMetros, setRaioMetros] = useState('300')
  const [cidadeBase, setCidadeBase] = useState('')
  const [ultimoRegistro, setUltimoRegistro] = useState<{ por?: string; em?: string }>({})

  useEffect(() => {
    let cancelado = false
    authFetch(`${BOT_URL}/api/missoes/parametros`)
      .then(r => r.json())
      .then(res => {
        if (cancelado || !res?.data) return
        const d: MissaoParametrosData = res.data
        setValorKm(String(d.valorKm ?? 1.5))
        setValorDiaria(String(d.valorDiaria ?? 120))
        setRaioMetros(String(d.raioCheckinMetros ?? 300))
        setCidadeBase(d.cidadeBase || '')
        setUltimoRegistro({ por: d.atualizadoPor, em: d.atualizadoEm })
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  if (loggedUser.cargo !== 'gerente') {
    return <p className="text-sm text-gray-500">Somente o gestor pode editar os parâmetros de Missões.</p>
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const vKm = Number(String(valorKm).replace(',', '.'))
    const vDiaria = Number(String(valorDiaria).replace(',', '.'))
    const vRaio = Math.round(Number(raioMetros))
    if (!Number.isFinite(vKm) || vKm < 0) {
      showToast('error', 'Informe um valor de km válido.')
      return
    }
    if (!Number.isFinite(vDiaria) || vDiaria < 0) {
      showToast('error', 'Informe um valor de diária válido.')
      return
    }
    if (!Number.isFinite(vRaio) || vRaio < 30) {
      showToast('error', 'Informe um raio mínimo de 30 metros.')
      return
    }
    setSalvando(true)
    try {
      const r = await authFetch(`${BOT_URL}/api/missoes/parametros`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valorKm: vKm,
          valorDiaria: vDiaria,
          raioCheckinMetros: vRaio,
          cidadeBase: cidadeBase.trim(),
        }),
      }).then(x => x.json())
      if (!r.success) throw new Error(r.error || 'Erro ao salvar')
      setUltimoRegistro({ por: r.data?.atualizadoPor, em: r.data?.atualizadoEm })
      showToast('success', 'Parâmetros de Missões atualizados.')
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao salvar parâmetros de Missões.')
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 py-4">Carregando parâmetros de Missões...</p>
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Parâmetros de Missões (Viagens)</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Usados automaticamente no cálculo do custo previsto (km × valor do km + diárias × dias + hospedagem) e na validação de distância do check-in no celular.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Valor do km rodado (R$/km)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorKm}
            onChange={e => setValorKm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple text-sm tabular-nums bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Valor da diária (R$/dia)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorDiaria}
            onChange={e => setValorDiaria(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple text-sm tabular-nums bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Raio válido do check-in (metros)
          </label>
          <input
            type="number"
            step="10"
            min="30"
            value={raioMetros}
            onChange={e => setRaioMetros(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple text-sm tabular-nums bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <p className="text-[11px] text-gray-400 mt-1">Acima deste raio, o check-in é aceito como &ldquo;Fora do local&rdquo;.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Cidade/endereço padrão de saída
          </label>
          <input
            type="text"
            placeholder="Ex.: Belo Horizonte - MG"
            value={cidadeBase}
            onChange={e => setCidadeBase(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-apple text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="text-xs text-gray-400">
          {ultimoRegistro.em ? (
            <>Última atualização por <span className="font-medium text-gray-600 dark:text-gray-300">{ultimoRegistro.por || 'Gestor'}</span> em {new Date(ultimoRegistro.em).toLocaleString('pt-BR')}</>
          ) : (
            'Valores padrão carregados'
          )}
        </div>
        <button
          type="submit"
          disabled={salvando}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-apple transition-colors"
        >
          {salvando ? 'Salvando...' : 'Salvar parâmetros'}
        </button>
      </div>
    </form>
  )
}
