import React from 'react'
import type { Cliente, Vendedor } from '../../types'
import { buscarEmpresasGoogleMaps, importarLugarComoLead, GooglePlace } from '../../lib/botApi'
import { MapPinIcon, BuildingStorefrontIcon, StarIcon, PhoneIcon, GlobeAltIcon, PlusIcon, MagnifyingGlassIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

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

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
  const data: Array<{ lat: string; lon: string }> = await res.json()
  if (!data || data.length === 0) return null
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) }
}

const MapaView: React.FC<MapaViewProps> = ({ clientes, loggedUser, showToast }) => {
  const [activeTab, setActiveTab] = React.useState<TabType>('leads')

  // ─── Índice rápido para detectar "já no CRM" ───
  const crmIndex = React.useMemo(() => {
    const byPlaceId = new Map<string, number>()
    const byName = new Map<string, number>()
    for (const c of clientes) {
      if (c.googlePlaceId) byPlaceId.set(c.googlePlaceId, c.id)
      byName.set(c.razaoSocial.toLowerCase().trim(), c.id)
    }
    return { byPlaceId, byName }
  }, [clientes])

  // ─── Tab Leads (visualização de clientes existentes) ───
  const [selectedClienteId, setSelectedClienteId] = React.useState<number>(clientes[0]?.id ?? 0)
  const [searchCliente, setSearchCliente] = React.useState('')
  const clientesFiltrados = React.useMemo(() => {
    const q = searchCliente.toLowerCase().trim()
    const list = q ? clientes.filter(c => c.razaoSocial.toLowerCase().includes(q) || (c.nomeFantasia || '').toLowerCase().includes(q) || (c.enderecoCidade || '').toLowerCase().includes(q)) : clientes
    return list.slice(0, 50)
  }, [clientes, searchCliente])

  React.useEffect(() => {
    if (clientes.length > 0 && !clientes.find(c => c.id === selectedClienteId)) {
      setSelectedClienteId(clientes[0].id)
    }
  }, [clientes])

  const selectedCliente = clientes.find((c) => c.id === selectedClienteId) ?? null
  const [address, setAddress] = React.useState<string>('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null)

  // Geocodifica automaticamente ao trocar de cliente
  React.useEffect(() => {
    if (!selectedCliente) return
    setError('')

    // Se já tem lat/lon salvo no banco, usa direto
    if (selectedCliente.latitude && selectedCliente.longitude) {
      setCoords({ lat: selectedCliente.latitude, lon: selectedCliente.longitude })
      const endereco = selectedCliente.endereco || [
        selectedCliente.enderecoRua, selectedCliente.enderecoNumero,
        selectedCliente.enderecoBairro, selectedCliente.enderecoCidade,
        selectedCliente.enderecoEstado,
      ].filter(Boolean).join(', ')
      setAddress(endereco)
      return
    }

    // Monta endereço completo para geocodificar
    const partes = [
      selectedCliente.enderecoRua && selectedCliente.enderecoNumero
        ? `${selectedCliente.enderecoRua}, ${selectedCliente.enderecoNumero}`
        : selectedCliente.enderecoRua || selectedCliente.endereco || '',
      selectedCliente.enderecoBairro || '',
      selectedCliente.enderecoCidade || '',
      selectedCliente.enderecoEstado || '',
    ].filter(Boolean)
    const enderecoCompleto = partes.join(', ')
    setAddress(enderecoCompleto)
    setCoords(null)

    if (!enderecoCompleto) return

    setIsLoading(true)
    geocodeAddress(enderecoCompleto)
      .then(result => {
        if (result) setCoords(result)
        else setError('Endereço não encontrado automaticamente. Edite e clique em Buscar.')
      })
      .catch(() => setError('Falha ao geocodificar. Verifique sua internet.'))
      .finally(() => setIsLoading(false))
  }, [selectedClienteId])

  const geocode = async () => {
    setError('')
    if (!address.trim()) {
      setError('Informe um endereço para localizar no mapa.')
      return
    }
    setIsLoading(true)
    try {
      const result = await geocodeAddress(address)
      if (!result) {
        setError('Endereço não encontrado. Tente adicionar cidade/UF.')
        setCoords(null)
      } else {
        setCoords(result)
      }
    } catch {
      setError('Falha ao consultar o mapa. Verifique sua internet e tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const iframeSrc = coords
    ? `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${coords.lat}%2C${coords.lon}&zoom=15`
    : null

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
  const [importedIds, setImportedIds] = React.useState<Set<string>>(new Set())
  const [prospCoords, setProspCoords] = React.useState<{ lat: number; lng: number } | null>(null)
  const [selectedPin, setSelectedPin] = React.useState<GooglePlace | null>(null)

  // Mapa de pins: usa o centróide dos resultados (média das coords)
  const prospMapSrc = React.useMemo(() => {
    const comCoords = prospResultados.filter(p => p.geometry?.location?.lat && p.geometry?.location?.lng)
    if (comCoords.length === 0) return null
    const lat = comCoords.reduce((s, p) => s + p.geometry.location.lat, 0) / comCoords.length
    const lon = comCoords.reduce((s, p) => s + p.geometry.location.lng, 0) / comCoords.length
    // Usa o primeiro resultado como marcador central se só tiver 1
    if (comCoords.length === 1) {
      return `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${lat}%2C${lon}&zoom=14`
    }
    // Centróide sem marcador — mostra a região geral
    return `https://www.openstreetmap.org/export/embed.html?layer=mapnik&bbox=${
      (lon - 0.05).toFixed(5)}%2C${(lat - 0.05).toFixed(5)}%2C${(lon + 0.05).toFixed(5)}%2C${(lat + 0.05).toFixed(5)}`
  }, [prospResultados])

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

      if (pageToken) {
        setProspResultados(prev => [...prev, ...(result.results || [])])
      } else {
        setProspResultados(result.results || [])
        setSelectedPin(null)
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
        setImportedIds(prev => new Set(prev).add(place.place_id))
      } else if (result.error?.includes('já existe')) {
        showToast?.('info', `${place.name} já está no CRM`)
        setImportedIds(prev => new Set(prev).add(place.place_id))
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

  const jaNosCrm = (place: GooglePlace): boolean => {
    if (crmIndex.byPlaceId.has(place.place_id)) return true
    if (crmIndex.byName.has(place.name.toLowerCase().trim())) return true
    if (importedIds.has(place.place_id)) return true
    return false
  }

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
              {clientes.length > 50 && !searchCliente && (
                <p className="text-xs text-gray-400 mt-1">Mostrando 50 de {clientes.length}. Use a busca para filtrar.</p>
              )}

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

              {/* Info do cliente selecionado */}
              {selectedCliente && (
                <div className="mt-4 rounded-apple border border-gray-100 bg-gray-50 p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-700">{selectedCliente.razaoSocial}</p>
                  <p className="text-xs text-gray-500">Etapa: {selectedCliente.etapa}</p>
                  {selectedCliente.googleRating && (
                    <p className="text-xs text-yellow-600">⭐ {selectedCliente.googleRating} ({selectedCliente.googleReviews} avaliações)</p>
                  )}
                  {selectedCliente.website && (
                    <a href={selectedCliente.website} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline block truncate">
                      {selectedCliente.website}
                    </a>
                  )}
                  {coords && (
                    <a
                      className="text-xs text-primary-700 hover:text-primary-900 underline inline-block"
                      href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=16/${coords.lat}/${coords.lon}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir no OpenStreetMap ↗
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-apple border border-gray-200 overflow-hidden bg-gray-50" style={{ height: 520 }}>
                {isLoading ? (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      Geocodificando endereço...
                    </div>
                  </div>
                ) : iframeSrc ? (
                  <iframe title="mapa" src={iframeSrc} className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                    <div className="text-center space-y-1">
                      <MapPinIcon className="w-10 h-10 text-gray-300 mx-auto" />
                      <p>Selecione um cliente ou informe um endereço.</p>
                    </div>
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
                  onKeyDown={e => e.key === 'Enter' && buscarEmpresas()}
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
                  onKeyDown={e => e.key === 'Enter' && buscarEmpresas()}
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
                <span className="text-sm text-gray-600">
                  {prospResultados.length} resultado{prospResultados.length !== 1 ? 's' : ''}
                  {' · '}
                  <span className="text-green-600 font-medium">
                    {prospResultados.filter(p => jaNosCrm(p)).length} já no CRM
                  </span>
                </span>
              )}
            </div>

            {prospError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-apple text-sm text-red-600">
                {prospError}
              </div>
            )}
          </div>

          {/* Mapa de área + cards lado a lado */}
          {prospResultados.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Mapa */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden" style={{ height: 520 }}>
                  {prospMapSrc ? (
                    <iframe title="mapa-prospecção" src={prospMapSrc} className="w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                      Sem coordenadas nos resultados
                    </div>
                  )}
                </div>
                {selectedPin && (
                  <div className="mt-2 bg-white rounded-apple border border-primary-200 p-3 shadow-sm">
                    <p className="text-sm font-medium text-gray-900">{selectedPin.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{selectedPin.formatted_address || selectedPin.vicinity}</p>
                    <a
                      href={`https://www.google.com/maps/place/?q=place_id:${selectedPin.place_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Ver no Google Maps ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="lg:col-span-3">
                <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Resultados encontrados</h3>
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                    {prospResultados.map((place) => {
                      const noCrm = jaNosCrm(place)
                      return (
                        <div
                          key={place.place_id}
                          onClick={() => setSelectedPin(place)}
                          className={`border rounded-apple p-3 cursor-pointer transition-all ${
                            selectedPin?.place_id === place.place_id
                              ? 'border-primary-400 bg-primary-50'
                              : noCrm
                              ? 'border-green-200 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-gray-900 text-sm truncate">{place.name}</h4>
                                {noCrm && (
                                  <span className="flex-shrink-0 flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    <CheckCircleIcon className="w-3 h-3" />
                                    No CRM
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {place.formatted_address || place.vicinity}
                              </p>
                            </div>
                            {place.rating && (
                              <div className="flex-shrink-0 flex items-center gap-1 text-xs text-yellow-600">
                                <StarIcon className="w-3.5 h-3.5" />
                                <span>{place.rating}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 flex items-center gap-3">
                            {place.formatted_phone_number && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <PhoneIcon className="w-3.5 h-3.5" />
                                <span>{place.formatted_phone_number}</span>
                              </div>
                            )}
                            {place.website && (
                              <div className="flex items-center gap-1 text-xs">
                                <GlobeAltIcon className="w-3.5 h-3.5 text-gray-400" />
                                <a
                                  href={place.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-primary-600 hover:underline truncate max-w-[120px]"
                                >
                                  Site
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                            {noCrm ? (
                              <span className="flex-1 text-center text-xs text-green-700 py-1">✓ Já importado</span>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); importarLead(place) }}
                                disabled={importingIds.has(place.place_id)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors text-xs"
                              >
                                <PlusIcon className="w-3.5 h-3.5" />
                                {importingIds.has(place.place_id) ? 'Importando...' : 'Importar Lead'}
                              </button>
                            )}
                            <a
                              href={`https://www.google.com/maps/place/?q=place_id:${place.place_id}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                              title="Ver no Google Maps"
                            >
                              <MapPinIcon className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {prospNextToken && (
                    <div className="mt-3 text-center">
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MapaView
