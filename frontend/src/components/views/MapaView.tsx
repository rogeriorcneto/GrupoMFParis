import React from 'react'
import type { Cliente, Vendedor } from '../../types'
import { buscarEmpresasGoogleMaps, importarLugarComoLead, GooglePlace } from '../../lib/botApi'
import { MapPinIcon, BuildingStorefrontIcon, StarIcon, PhoneIcon, GlobeAltIcon, PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

interface MapaViewProps {
  clientes: Cliente[]
  loggedUser: Vendedor | null
  showToast?: (type: 'success' | 'error' | 'info', message: string) => void
}

type TabType = 'leads' | 'prospeccao'

const TIPOS_NEGOCIO = [
  { value: '', label: 'Qualquer tipo' },
  { value: 'supermarket', label: 'Supermercado' },
  { value: 'convenience_store', label: 'Loja de Conveniência' },
  { value: 'bakery', label: 'Padaria' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'cafe', label: 'Cafeteria' },
  { value: 'bar', label: 'Bar' },
  { value: 'food', label: 'Estabelecimento de Alimentação' },
  { value: 'store', label: 'Loja/Comércio' },
  { value: 'pharmacy', label: 'Farmácia' },
  { value: 'gas_station', label: 'Posto de Combustível' },
  { value: 'shopping_mall', label: 'Shopping Center' },
]

const MapaView: React.FC<MapaViewProps> = ({ clientes, loggedUser, showToast }) => {
  const [activeTab, setActiveTab] = React.useState<TabType>('leads')
  
  // ─── Tab Leads (visualização de clientes existentes) ───
  const [selectedClienteId, setSelectedClienteId] = React.useState<number>(clientes[0]?.id ?? 0)
  const [searchCliente, setSearchCliente] = React.useState('')
  const clientesFiltrados = React.useMemo(() => {
    const q = searchCliente.toLowerCase().trim()
    const list = q ? clientes.filter(c => c.razaoSocial.toLowerCase().includes(q) || (c.enderecoCidade || '').toLowerCase().includes(q)) : clientes
    return list.slice(0, 50)
  }, [clientes, searchCliente])

  React.useEffect(() => {
    if (clientes.length > 0 && !clientes.find(c => c.id === selectedClienteId)) {
      setSelectedClienteId(clientes[0].id)
    }
  }, [clientes])
  const selectedCliente = clientes.find((c) => c.id === selectedClienteId) ?? null
  const [address, setAddress] = React.useState<string>(selectedCliente?.endereco || '')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null)

  React.useEffect(() => {
    const nextAddress = selectedCliente?.endereco || ''
    setAddress(nextAddress)
    setCoords(null)
    setError('')
  }, [selectedClienteId])

  const geocode = async () => {
    setError('')
    if (!address.trim()) {
      setError('Informe um endereço para localizar no mapa.')
      return
    }
    setIsLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      const data: Array<{ lat: string; lon: string }> = await res.json()
      if (!data || data.length === 0) {
        setError('Endereço não encontrado. Tente adicionar cidade/UF.')
        setCoords(null)
        return
      }
      setCoords({ lat: Number(data[0].lat), lon: Number(data[0].lon) })
    } catch {
      setError('Falha ao consultar o mapa. Verifique sua internet e tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Tab Prospecção (Google Maps) ───
  const [prospQuery, setProspQuery] = React.useState('')
  const [prospCidade, setProspCidade] = React.useState('')
  const [prospTipo, setProspTipo] = React.useState('')
  const [prospRaio, setProspRaio] = React.useState(5000)
  const [prospResultados, setProspResultados] = React.useState<GooglePlace[]>([])
  const [prospLoading, setProspLoading] = React.useState(false)
  const [prospError, setProspError] = React.useState('')
  const [prospNextToken, setProspNextToken] = React.useState<string | undefined>()
  const [importingIds, setImportingIds] = React.useState<Set<string>>(new Set())
  const [prospCoords, setProspCoords] = React.useState<{ lat: number; lng: number } | null>(null)

  const buscarEmpresas = async (pageToken?: string) => {
    if (!prospQuery.trim() && !prospCidade.trim()) {
      setProspError('Informe um termo de busca ou cidade')
      return
    }
    setProspLoading(true)
    setProspError('')
    try {
      const query = prospCidade.trim() 
        ? `${prospQuery.trim() || ''} ${prospCidade}`.trim()
        : prospQuery.trim()
      
      const result = await buscarEmpresasGoogleMaps(
        query,
        prospCoords || undefined,
        prospRaio,
        prospTipo || undefined
      )
      
      if (result.error) {
        setProspError(result.error)
        return
      }
      
      if (pageToken && result.next_page_token) {
        setProspResultados(prev => [...prev, ...(result.results || [])])
      } else {
        setProspResultados(result.results || [])
      }
      setProspNextToken(result.next_page_token)
      
      if (result.results?.length === 0) {
        setProspError('Nenhum resultado encontrado')
      }
    } catch (err: any) {
      setProspError(err.message || 'Erro ao buscar empresas')
    } finally {
      setProspLoading(false)
    }
  }

  const importarLead = async (place: GooglePlace) => {
    if (importingIds.has(place.place_id)) return
    setImportingIds(prev => new Set(prev).add(place.place_id))
    try {
      const result = await importarLugarComoLead(place, loggedUser?.id)
      if (result.success) {
        showToast?.('success', `${place.name} importado como lead!`)
      } else if (result.error?.includes('já existe')) {
        showToast?.('info', `${place.name} já está no CRM`)
      } else {
        showToast?.('error', result.error || 'Erro ao importar')
      }
    } catch (err: any) {
      showToast?.('error', err.message || 'Erro ao importar')
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev)
        next.delete(place.place_id)
        return next
      })
    }
  }

  const iframeSrc = coords
    ? `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${coords.lat}%2C${coords.lon}&zoom=15`
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Mapa</h1>
          <p className="mt-1 text-sm text-gray-600">Visualize leads e prospecte novos negócios.</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('leads')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'leads' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Meus Leads
          </button>
          <button
            onClick={() => setActiveTab('prospeccao')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'prospeccao' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Prospecção
          </button>
        </div>
      </div>

      {/* ─── TAB: Meus Leads ─── */}
      {activeTab === 'leads' && (
        <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Lead / Empresa</label>
              <input
                type="text"
                value={searchCliente}
                onChange={e => setSearchCliente(e.target.value)}
                placeholder="Buscar empresa..."
                className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-1 text-sm"
              />
              <select
                value={selectedClienteId}
                onChange={(e) => { setSelectedClienteId(Number(e.target.value)); setSearchCliente('') }}
                size={Math.min(clientesFiltrados.length, 6)}
                className="w-full px-2 py-1 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              >
                {clientesFiltrados.map((c) => (
                  <option key={c.id} value={c.id}>{c.razaoSocial}</option>
                ))}
              </select>
              {clientes.length > 50 && !searchCliente && <p className="text-xs text-gray-400 mt-1">Mostrando 50 de {clientes.length}. Use a busca para filtrar.</p>}

              <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">Endereço</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && geocode()}
                className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Rua, número, bairro, cidade - UF"
              />
              <button
                onClick={geocode}
                disabled={isLoading}
                className="mt-3 w-full px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 transition-colors duration-200 shadow-apple-sm"
              >
                {isLoading ? 'Buscando...' : 'Buscar no mapa'}
              </button>
              {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
              {coords && (
                <div className="mt-4 rounded-apple border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs text-gray-700">Lat: {coords.lat.toFixed(6)}</div>
                  <div className="text-xs text-gray-700">Lon: {coords.lon.toFixed(6)}</div>
                  <a
                    className="text-xs text-primary-700 hover:text-primary-900 underline mt-2 inline-block"
                    href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=16/${coords.lat}/${coords.lon}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir no OpenStreetMap
                  </a>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-apple border border-gray-200 overflow-hidden bg-gray-50" style={{ height: 520 }}>
                {iframeSrc ? (
                  <iframe title="mapa" src={iframeSrc} className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                    Informe um endereço e clique em "Buscar no mapa".
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: Prospecção ─── */}
      {activeTab === 'prospeccao' && (
        <div className="space-y-4">
          {/* Painel de busca */}
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <BuildingStorefrontIcon className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Prospecção via Google Maps</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Termo de busca</label>
                <input
                  type="text"
                  value={prospQuery}
                  onChange={e => setProspQuery(e.target.value)}
                  placeholder="Ex: supermercado, padaria..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade/Região</label>
                <input
                  type="text"
                  value={prospCidade}
                  onChange={e => setProspCidade(e.target.value)}
                  placeholder="Ex: São Paulo, SP"
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de negócio</label>
                <select
                  value={prospTipo}
                  onChange={e => setProspTipo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                >
                  {TIPOS_NEGOCIO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raio (metros)</label>
                <select
                  value={prospRaio}
                  onChange={e => setProspRaio(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                >
                  <option value={1000}>1 km</option>
                  <option value={5000}>5 km</option>
                  <option value={10000}>10 km</option>
                  <option value={25000}>25 km</option>
                  <option value={50000}>50 km</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => buscarEmpresas()}
                disabled={prospLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 disabled:bg-gray-400 transition-colors duration-200"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
                {prospLoading ? 'Buscando...' : 'Buscar Empresas'}
              </button>
              {prospResultados.length > 0 && (
                <span className="text-sm text-gray-600">{prospResultados.length} resultados</span>
              )}
            </div>

            {prospError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-apple text-sm text-red-600">
                {prospError}
              </div>
            )}
          </div>

          {/* Resultados */}
          {prospResultados.length > 0 && (
            <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Resultados encontrados</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                {prospResultados.map((place) => (
                  <div key={place.place_id} className="border border-gray-200 rounded-apple p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium text-gray-900">{place.name}</h4>
                      {place.rating && (
                        <div className="flex items-center gap-1 text-sm text-yellow-600">
                          <StarIcon className="w-4 h-4" />
                          <span>{place.rating}</span>
                          {place.user_ratings_total && (
                            <span className="text-gray-400 text-xs">({place.user_ratings_total})</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {place.formatted_address || place.vicinity}
                    </p>
                    
                    <div className="mt-3 space-y-1">
                      {place.formatted_phone_number && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <PhoneIcon className="w-4 h-4" />
                          <span>{place.formatted_phone_number}</span>
                        </div>
                      )}
                      {place.website && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <GlobeAltIcon className="w-4 h-4" />
                          <a href={place.website} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline truncate max-w-[200px]">
                            Site
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                      <button
                        onClick={() => importarLead(place)}
                        disabled={importingIds.has(place.place_id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm"
                      >
                        <PlusIcon className="w-4 h-4" />
                        {importingIds.has(place.place_id) ? 'Importando...' : 'Importar Lead'}
                      </button>
                      <a
                        href={`https://www.google.com/maps/place/?q=place_id:${place.place_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                        title="Ver no Google Maps"
                      >
                        <MapPinIcon className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              
              {prospNextToken && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => buscarEmpresas(prospNextToken)}
                    disabled={prospLoading}
                    className="px-4 py-2 border border-gray-300 rounded-apple text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {prospLoading ? 'Carregando...' : 'Carregar mais resultados'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MapaView
