import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ErpLayout from './ErpLayout'

interface BiData {
  totalClientes: number
  totalPedidos: number
  faturamentoTotal: number
  ticketMedio: number
  pedidosPorMes: Record<string, number>
  faturamentoPorMes: Record<string, number>
  topClientes: Array<{ nome: string; total: number }>
  pedidosPorStatus: Record<string, number>
}

export default function BiSystem({ onVoltar }: { onVoltar: () => void }) {
  const [activeMenu, setActiveMenu] = useState('vendas')
  const [data, setData] = useState<BiData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        supabase.from('clientes').select('id, nome'),
        supabase.from('pedidos').select('*'),
      ])
      const pedidos = p.data || []
      const clientes = c.data || []
      const faturamento = pedidos.reduce((s: number, x: any) => s + Number(x.valor_total || 0), 0)

      // Pedidos por mês
      const pedidosPorMes: Record<string, number> = {}
      const faturamentoPorMes: Record<string, number> = {}
      pedidos.forEach((ped: any) => {
        const mes = (ped.created_at || '').slice(0, 7)
        if (mes) {
          pedidosPorMes[mes] = (pedidosPorMes[mes] || 0) + 1
          faturamentoPorMes[mes] = (faturamentoPorMes[mes] || 0) + Number(ped.valor_total || 0)
        }
      })

      // Top clientes por valor
      const porCliente: Record<number, number> = {}
      pedidos.forEach((ped: any) => {
        if (ped.cliente_id) porCliente[ped.cliente_id] = (porCliente[ped.cliente_id] || 0) + Number(ped.valor_total || 0)
      })
      const topClientes = Object.entries(porCliente)
        .map(([id, total]) => ({
          nome: clientes.find((c: any) => c.id === Number(id))?.nome || `Cliente ${id}`,
          total
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      const pedidosPorStatus: Record<string, number> = {}
      pedidos.forEach((ped: any) => {
        const s = ped.status || 'sem status'
        pedidosPorStatus[s] = (pedidosPorStatus[s] || 0) + 1
      })

      setData({
        totalClientes: clientes.length,
        totalPedidos: pedidos.length,
        faturamentoTotal: faturamento,
        ticketMedio: pedidos.length > 0 ? faturamento / pedidos.length : 0,
        pedidosPorMes,
        faturamentoPorMes,
        topClientes,
        pedidosPorStatus,
      })
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const menu = [
    { id: 'vendas', label: 'Vendas', icone: '📈' },
    { id: 'clientes', label: 'Clientes', icone: '👥' },
    { id: 'mensal', label: 'Análise Mensal', icone: '📅' },
  ]

  return (
    <ErpLayout
      titulo="Business Intelligence"
      subtitulo="Análises gerenciais"
      icone="📊"
      cor="from-pink-500 to-purple-600"
      menu={menu}
      activeMenu={activeMenu}
      onMenuChange={setActiveMenu}
      onVoltarPortal={onVoltar}
    >
      <div className="p-6">
        {loading && <p>Carregando análises...</p>}

        {!loading && data && activeMenu === 'vendas' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">📈 Análise de Vendas</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <KpiBi titulo="Total de Pedidos" valor={data.totalPedidos} cor="from-blue-400 to-indigo-600" icone="📦" />
              <KpiBi titulo="Faturamento Total" valor={`R$ ${data.faturamentoTotal.toFixed(0)}`} cor="from-green-400 to-emerald-600" icone="💰" />
              <KpiBi titulo="Ticket Médio" valor={`R$ ${data.ticketMedio.toFixed(0)}`} cor="from-purple-400 to-pink-600" icone="💎" />
              <KpiBi titulo="Total Clientes" valor={data.totalClientes} cor="from-orange-400 to-red-600" icone="👥" />
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-bold mb-4">Pedidos por Status</h3>
              <div className="space-y-3">
                {Object.entries(data.pedidosPorStatus).map(([status, count]) => (
                  <div key={status}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium capitalize">{status}</span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                    <div className="bg-gray-200 h-3 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-pink-400 to-purple-500 h-full" style={{ width: `${(count / data.totalPedidos) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && data && activeMenu === 'clientes' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">👥 Top Clientes por Faturamento</h2>
            <div className="bg-white rounded-xl shadow-sm p-6">
              {data.topClientes.length === 0 && <p className="text-gray-500">Sem dados de clientes</p>}
              <div className="space-y-3">
                {data.topClientes.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      #{idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{c.nome}</p>
                      <div className="bg-gray-200 h-2 rounded-full overflow-hidden mt-1">
                        <div className="bg-gradient-to-r from-pink-400 to-purple-500 h-full" style={{ width: `${(c.total / data.topClientes[0].total) * 100}%` }}></div>
                      </div>
                    </div>
                    <span className="font-bold text-purple-700">R$ {c.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && data && activeMenu === 'mensal' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">📅 Análise Mensal</h2>
            <div className="bg-white rounded-xl shadow-sm p-6">
              {Object.keys(data.faturamentoPorMes).length === 0 && <p className="text-gray-500">Sem dados</p>}
              {Object.entries(data.faturamentoPorMes)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([mes, valor]) => {
                  const max = Math.max(...Object.values(data.faturamentoPorMes), 1)
                  return (
                    <div key={mes} className="mb-4">
                      <div className="flex justify-between mb-1">
                        <span className="font-bold">{mes}</span>
                        <span className="font-bold text-purple-700">R$ {valor.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">{data.pedidosPorMes[mes] || 0} pedidos</p>
                      <div className="bg-gray-200 h-3 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-pink-400 to-purple-500 h-full" style={{ width: `${(valor / max) * 100}%` }}></div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </ErpLayout>
  )
}

function KpiBi({ titulo, valor, cor, icone }: any) {
  return (
    <div className={`bg-gradient-to-br ${cor} text-white rounded-xl p-5 shadow-md`}>
      <span className="text-3xl">{icone}</span>
      <p className="text-sm opacity-90 mt-2">{titulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
    </div>
  )
}
