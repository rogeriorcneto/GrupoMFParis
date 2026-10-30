import React, { useEffect, useState } from 'react'
import TreinamentoView from '../views/TreinamentoView'
import * as db from '../../lib/database'
import type { Produto, Vendedor } from '../../types'

/**
 * Módulo standalone "Academia de Vendas" no portal Grupo Paris.
 * Renderiza a mesma TreinamentoView usada dentro do CRM — só a academia.
 */
export default function AcademiaSystem({ onVoltar }: { onVoltar: () => void }) {
  const [vendedor, setVendedor] = useState<Vendedor | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const [v, prods] = await Promise.all([
          db.getLoggedVendedor().catch(() => null),
          db.fetchProdutos().catch(() => [] as Produto[]),
        ])
        if (!ativo) return
        setVendedor(v)
        setProdutos(prods)
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => { ativo = false }
  }, [])

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando Academia de Vendas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 h-14 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onVoltar}
          className="text-sm text-gray-500 hover:text-gray-800 font-medium"
        >
          ← Portal Grupo Paris
        </button>
        <h1 className="text-base sm:text-lg font-semibold text-gray-900">🎓 Academia de Vendas</h1>
      </div>
      <TreinamentoView
        vendedor={vendedor || ({ id: 0, nome: 'Vendedor', email: '', cargo: 'vendedor', ativo: true } as Vendedor)}
        isGerente={vendedor?.cargo === 'gerente'}
        produtos={produtos}
      />
    </div>
  )
}
