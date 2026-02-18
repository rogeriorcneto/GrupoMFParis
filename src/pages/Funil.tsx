import React from 'react'
import { Card } from '../components/ui/Card'

export const Funil: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Funil de Vendas</h1>
        <p className="mt-1 text-sm text-gray-600">
          Arraste e solte os clientes para movê-los entre as etapas
        </p>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Prospecção */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Prospecção</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                24
              </span>
            </div>
            <div className="space-y-3 min-h-[400px]">
              <div className="p-3 bg-gray-50 rounded-apple border border-gray-200 cursor-pointer hover:shadow-apple transition-shadow duration-200">
                <h4 className="font-medium text-gray-900 text-sm">SuperBH Ltda</h4>
                <p className="text-xs text-gray-500 mt-1">João Silva</p>
                <div className="flex items-center mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    8 lojas
                  </span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-apple border border-gray-200 cursor-pointer hover:shadow-apple transition-shadow duration-200">
                <h4 className="font-medium text-gray-900 text-sm">MegaMart Comercial</h4>
                <p className="text-xs text-gray-500 mt-1">Maria Santos</p>
                <div className="flex items-center mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    5 lojas
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Amostra */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Amostra</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800">
                18
              </span>
            </div>
            <div className="space-y-3 min-h-[400px]">
              <div className="p-3 bg-gray-50 rounded-apple border border-gray-200 cursor-pointer hover:shadow-apple transition-shadow duration-200">
                <h4 className="font-medium text-gray-900 text-sm">Rede Plus SA</h4>
                <p className="text-xs text-gray-500 mt-1">Carlos Pereira</p>
                <div className="flex items-center mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning-100 text-warning-800">
                    15 dias restantes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Homologado */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Homologado</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-800">
                12
              </span>
            </div>
            <div className="space-y-3 min-h-[400px]">
              <div className="p-3 bg-gray-50 rounded-apple border border-gray-200 cursor-pointer hover:shadow-apple transition-shadow duration-200">
                <h4 className="font-medium text-gray-900 text-sm">GoodFood Supermercados</h4>
                <p className="text-xs text-gray-500 mt-1">Ana Costa</p>
                <div className="flex items-center mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success-100 text-success-800">
                    45 dias restantes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Negociação */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Negociação</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                8
              </span>
            </div>
            <div className="space-y-3 min-h-[400px]">
              <div className="p-3 bg-gray-50 rounded-apple border border-gray-200 cursor-pointer hover:shadow-apple transition-shadow duration-200">
                <h4 className="font-medium text-gray-900 text-sm">Mercado da Vila</h4>
                <p className="text-xs text-gray-500 mt-1">Roberto Lima</p>
                <div className="flex items-center mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    R$ 65.000
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Pós-Venda */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Pós-Venda</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                6
              </span>
            </div>
            <div className="space-y-3 min-h-[400px]">
              <div className="p-3 bg-gray-50 rounded-apple border border-gray-200 cursor-pointer hover:shadow-apple transition-shadow duration-200">
                <h4 className="font-medium text-gray-900 text-sm">Supermercado Central</h4>
                <p className="text-xs text-gray-500 mt-1">Pedro Alves</p>
                <div className="flex items-center mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Pedido #1234
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
