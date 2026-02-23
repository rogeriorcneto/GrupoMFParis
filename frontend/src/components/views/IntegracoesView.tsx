import React from 'react'

const IntegracoesView: React.FC = () => {
  const [integracoes, setIntegracoes] = React.useState([
    { id: 1, nome: 'WhatsApp Business', tipo: 'whatsapp', status: 'conectado', icon: '💬' },
    { id: 2, nome: 'Gmail', tipo: 'email', status: 'conectado', icon: '📧' },
    { id: 3, nome: 'LinkedIn', tipo: 'linkedin', status: 'desconectado', icon: '💼' },
    { id: 4, nome: 'Instagram Business', tipo: 'instagram', status: 'desconectado', icon: '📸' },
    { id: 5, nome: 'Facebook Pages', tipo: 'facebook', status: 'desconectado', icon: '👥' },
    { id: 6, nome: 'Google Sheets', tipo: 'sheets', status: 'conectado', icon: '📊' },
    { id: 7, nome: 'Zapier', tipo: 'zapier', status: 'desconectado', icon: '⚡' },
    { id: 8, nome: 'Webhook Personalizado', tipo: 'webhook', status: 'desconectado', icon: '🔗' }
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Integrações</h1>
        <p className="mt-1 text-sm text-gray-600">Conecte o CRM com suas ferramentas favoritas</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integracoes.map((int) => (
          <div key={int.id} className="bg-white rounded-apple shadow-apple-sm border-2 border-gray-200 p-6 hover:border-primary-300 transition-all">
            <div className="flex items-center gap-3">
              <div className="text-4xl">{int.icon}</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{int.nome}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${int.status === 'conectado' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                  <span className="text-xs text-gray-600">{int.status === 'conectado' ? 'Conectado' : 'Desconectado'}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              {int.tipo === 'whatsapp' && 'Envie mensagens automáticas via WhatsApp Business API'}
              {int.tipo === 'email' && 'Sincronize emails e envie campanhas automatizadas'}
              {int.tipo === 'linkedin' && 'Conecte com leads e envie mensagens pelo LinkedIn'}
              {int.tipo === 'instagram' && 'Gerencie DMs e interações do Instagram Business'}
              {int.tipo === 'facebook' && 'Integre com Facebook Pages e Messenger'}
              {int.tipo === 'sheets' && 'Exporte e importe dados via Google Sheets'}
              {int.tipo === 'zapier' && 'Conecte com 5000+ apps via Zapier'}
              {int.tipo === 'webhook' && 'Configure webhooks personalizados'}
            </p>
            <button
              onClick={() => {
                const novoStatus = int.status === 'conectado' ? 'desconectado' : 'conectado'
                setIntegracoes(prev => prev.map(i => i.id === int.id ? {...i, status: novoStatus} : i))
                alert(`${int.nome} ${novoStatus === 'conectado' ? 'conectado' : 'desconectado'} com sucesso!`)
              }}
              className={`mt-4 w-full px-4 py-2 rounded-apple shadow-apple-sm font-semibold transition-colors ${int.status === 'conectado' ? 'bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
            >
              {int.status === 'conectado' ? 'Desconectar' : 'Conectar'}
            </button>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 rounded-apple border-2 border-blue-200 p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">💡</div>
          <div>
            <h3 className="text-lg font-semibold text-blue-900">Dica: Automatize seu fluxo</h3>
            <p className="text-sm text-blue-700 mt-2">Conecte WhatsApp + Gmail + Google Sheets para criar um fluxo completo.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default IntegracoesView
