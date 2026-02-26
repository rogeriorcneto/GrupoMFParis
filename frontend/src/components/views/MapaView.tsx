import React from 'react'
import type { Cliente } from '../../types'

const MapaView: React.FC<{ clientes: Cliente[] }> = ({ clientes }) => {
  const [selectedClienteId, setSelectedClienteId] = React.useState<number>(clientes[0]?.id ?? 0)
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
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      })
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

  const iframeSrc = coords
    ? `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${coords.lat}%2C${coords.lon}&zoom=15`
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Mapa de Leads</h1>
        <p className="mt-1 text-sm text-gray-600">Localize leads pelo endereço e visualize no mapa.</p>
      </div>

      <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead / Empresa</label>
            <select
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-apple focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razaoSocial}
                </option>
              ))}
            </select>

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

            {error && (
              <div className="mt-3 text-sm text-red-600">{error}</div>
            )}

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
                <iframe
                  title="mapa"
                  src={iframeSrc}
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                  Informe um endereço e clique em "Buscar no mapa".
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MapaView
