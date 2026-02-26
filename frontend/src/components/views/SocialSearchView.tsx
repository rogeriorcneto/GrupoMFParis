import React from 'react'

const SocialSearchView: React.FC<{ onAddLead: (nome: string, telefone: string, endereco: string) => void }> = ({ onAddLead }) => {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchType, setSearchType] = React.useState<'instagram' | 'linkedin' | 'google' | 'facebook' | 'painel'>('painel')
  const [location, setLocation] = React.useState('Belo Horizonte - MG')
  const [isSearching, setIsSearching] = React.useState(false)
  const [results, setResults] = React.useState<Array<{ id: number; nome: string; descricao: string; endereco: string; telefone: string; site?: string; instagram?: string; linkedin?: string; facebook?: string; fonte?: string }>>([])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    await new Promise(r => setTimeout(r, 1500))
    let mockResults: typeof results = []
    if (searchType === 'painel' || searchType === 'google') {
      mockResults = [
        { id: 1, nome: 'SuperMercado Central BH', descricao: 'Supermercado de médio porte no centro de BH. 3 lojas.', endereco: 'Av. Afonso Pena, 1500 - Centro, BH - MG', telefone: '(31) 3333-4444', site: 'www.supercentralbh.com.br', instagram: '@supercentralbh', facebook: 'SuperCentralBH', fonte: searchType === 'painel' ? 'Google + Redes Sociais' : 'Google' },
        { id: 2, nome: 'Mercado Família BH', descricao: 'Rede familiar com 5 unidades em BH.', endereco: 'Rua da Bahia, 890 - Centro, BH - MG', telefone: '(31) 3222-5555', instagram: '@mercadofamiliabh', facebook: 'MercadoFamiliaBH', fonte: searchType === 'painel' ? 'Google + Redes Sociais' : 'Google' },
        { id: 3, nome: 'SuperCompras Pampulha', descricao: 'Supermercado premium na Pampulha.', endereco: 'Av. Portugal, 3200 - Pampulha, BH - MG', telefone: '(31) 3444-6666', site: 'www.supercompraspampulha.com.br', linkedin: 'SuperCompras Pampulha', fonte: searchType === 'painel' ? 'Google + Redes Sociais' : 'Google' }
      ]
    } else if (searchType === 'instagram') {
      mockResults = [
        { id: 1, nome: 'Empório Gourmet BH', descricao: 'Produtos premium. 12k seguidores.', endereco: 'Rua Pernambuco, 550 - Savassi, BH - MG', telefone: '(31) 99888-7777', instagram: '@emporiogourmetbh', fonte: 'Instagram' },
        { id: 2, nome: 'Açougue Premium BH', descricao: 'Carnes nobres. 8k seguidores.', endereco: 'Av. Raja Gabaglia, 2000 - Luxemburgo, BH - MG', telefone: '(31) 99777-6666', instagram: '@acouguepremiumbh', fonte: 'Instagram' }
      ]
    } else if (searchType === 'facebook') {
      mockResults = [
        { id: 1, nome: 'Distribuidora Alimentos BH', descricao: 'Atacadista. 5.000 curtidas.', endereco: 'Av. Cristiano Machado, 1500 - Cidade Nova, BH - MG', telefone: '(31) 3555-4444', facebook: 'DistribuidoraAlimentosBH', fonte: 'Facebook' },
        { id: 2, nome: 'Padaria Pão Quente BH', descricao: 'Rede de padarias. 3 unidades.', endereco: 'Rua Curitiba, 800 - Centro, BH - MG', telefone: '(31) 3222-3333', facebook: 'PadariasPaoQuente', fonte: 'Facebook' }
      ]
    } else if (searchType === 'linkedin') {
      mockResults = [
        { id: 1, nome: 'Rede Supermercados Mineiros S.A.', descricao: 'Rede com 15 lojas em MG. 500+ funcionários.', endereco: 'Av. do Contorno, 5000 - Funcionários, BH - MG', telefone: '(31) 3000-9000', linkedin: 'Rede Supermercados Mineiros', site: 'www.redesupermineiros.com.br', fonte: 'LinkedIn' }
      ]
    }
    setResults(mockResults)
    setIsSearching(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Busca por Redes Sociais</h1>
        <p className="mt-1 text-sm text-gray-600">Encontre potenciais clientes através de buscas em redes sociais e Google</p>
      </div>
      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">O que você procura?</label>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ex: supermercados, restaurantes, hotéis..." className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Região</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Cidade - UF" className="w-full px-4 py-3 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fonte de busca</label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { id: 'painel', label: '🎯 Painel', desc: 'Busca completa' },
                { id: 'google', label: '🔍 Google', desc: 'Busca geral' },
                { id: 'instagram', label: '📸 Instagram', desc: 'Perfis comerciais' },
                { id: 'facebook', label: '👥 Facebook', desc: 'Páginas e grupos' },
                { id: 'linkedin', label: '💼 LinkedIn', desc: 'Empresas B2B' }
              ].map((source) => (
                <button key={source.id} onClick={() => setSearchType(source.id as any)} className={`p-3 rounded-apple border-2 transition-all ${searchType === source.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-center">
                    <div className="text-base font-semibold text-gray-900">{source.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{source.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSearch} disabled={!searchQuery.trim() || isSearching} className="w-full px-6 py-3 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 shadow-apple-sm font-semibold">
            {isSearching ? '🔍 Buscando...' : '🔍 Buscar Potenciais Clientes'}
          </button>
        </div>
      </div>
      {results.length > 0 && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Resultados ({results.length})</h3>
          </div>
          <div className="p-6 space-y-4">
            {results.map((result) => (
              <div key={result.id} className="p-4 border-2 border-gray-200 rounded-apple hover:border-primary-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-900">{result.nome}</h4>
                    <p className="text-sm text-gray-600 mt-1">{result.descricao}</p>
                    <div className="mt-3 space-y-1">
                      <p className="text-sm text-gray-700">📍 {result.endereco}</p>
                      <p className="text-sm text-gray-700">📞 {result.telefone}</p>
                      {result.site && <p className="text-sm text-primary-600">🌐 {result.site}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {result.fonte && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-semibold">🎯 {result.fonte}</span>}
                        {result.instagram && <span className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded-full">📸 {result.instagram}</span>}
                        {result.facebook && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">👥 {result.facebook}</span>}
                        {result.linkedin && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">💼 {result.linkedin}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { onAddLead(result.nome, result.telefone, result.endereco); alert(`✅ "${result.nome}" adicionado como lead em Prospecção!`) }} className="ml-4 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 shadow-apple-sm whitespace-nowrap">➕ Adicionar Lead</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!isSearching && results.length === 0 && (
        <div className="bg-gray-50 rounded-apple border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-600">Digite sua busca e clique em "Buscar" para encontrar potenciais clientes</p>
          <p className="text-sm text-gray-500 mt-2">MVP: Demonstração com dados mockados</p>
        </div>
      )}
    </div>
  )
}

export default SocialSearchView
