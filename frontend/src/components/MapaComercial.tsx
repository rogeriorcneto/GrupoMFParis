import React, { useMemo, useRef, useState, useEffect } from 'react'
import { callAI } from '../lib/gemini'
import type { Cliente, Vendedor, Tarefa, Pedido } from '../types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import {
  UserGroupIcon,
  UserPlusIcon,
  BriefcaseIcon,
  StarIcon,
  TruckIcon,
  MapIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'

declare global {
  interface Window {
    google?: any
    initMap?: () => void
  }
}

interface MapaComercialProps {
  clientes: Cliente[]
  vendedores: Vendedor[]
  tarefas: Tarefa[]
  pedidos: Pedido[]
  loggedUser: Vendedor | null
}

type Layer = 'ativos' | 'prospectos' | 'vendedores' | 'representantes' | 'rotas' | 'roteiro' | 'volume' | 'potencial'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

async function googleGeocode(address: string): Promise<{ lat: number; lon: number } | null> {
  const google = window.google
  if (!google?.maps) return null
  const geocoder = new google.maps.Geocoder()
  try {
    const results = await new Promise<any[]>((resolve, reject) => {
      geocoder.geocode({ address }, (results: any, status: string) => {
        if (status === 'OK' && results?.length) resolve(results)
        else reject(new Error(status))
      })
    })
    const loc = results[0].geometry.location
    return { lat: loc.lat(), lon: loc.lng() }
  } catch {
    return null
  }
}

function buildAddress(c: Cliente) {
  if (c.latitude && c.longitude) return null
  const partes = [
    c.enderecoRua && c.enderecoNumero ? `${c.enderecoRua}, ${c.enderecoNumero}` : c.enderecoRua || c.endereco || '',
    c.enderecoBairro || '',
    c.enderecoCidade || '',
    c.enderecoEstado || '',
  ].filter(Boolean)
  return partes.join(', ')
}

export default function MapaComercial({ clientes, vendedores, tarefas, pedidos, loggedUser }: MapaComercialProps) {
  const [layer, setLayer] = useState<Layer>('ativos')
  const [selectedId, setSelectedId] = useState<string | number | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [routeIds, setRouteIds] = useState<Set<number>>(new Set())
  const [routeOrder, setRouteOrder] = useState<number[] | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const geocodeCache = useRef<Map<string, { lat: number; lon: number } | null>>(new Map())
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const selectedMarkerRef = useRef<any>(null)
  const layerMarkersRef = useRef<any[]>([])
  const directionsServiceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)

  const selectCliente = async (c: Cliente) => {
    setSelectedId(c.id)
    if (c.latitude && c.longitude) {
      setCoords({ lat: c.latitude, lon: c.longitude })
      return
    }
    const address = buildAddress(c)
    if (!address) {
      setCoords(null)
      return
    }
    const cached = geocodeCache.current.get(address)
    if (cached !== undefined) {
      setCoords(cached)
      return
    }
    const result = await googleGeocode(address)
    geocodeCache.current.set(address, result)
    setCoords(result)
  }

  const exibirRoteiroNoMapa = () => {
    if (!mapRef.current || !window.google?.maps?.DirectionsService) return
    const rota = routeOrder?.map(id => ativos.find(c => c.id === id)).filter((c): c is Cliente => !!c) || []
    if (rota.length < 2) return
    const origin = enderecoCompleto(rota[0])
    const destination = enderecoCompleto(rota[rota.length - 1])
    const waypoints = rota.slice(1, -1)
      .map(enderecoCompleto)
      .filter(Boolean)
      .map(addr => ({ location: addr, stopover: true }))
    if (!origin || !destination) return
    if (!directionsServiceRef.current) {
      directionsServiceRef.current = new window.google.maps.DirectionsService()
    }
    directionsRendererRef.current?.setMap(null)
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({ map: mapRef.current, suppressMarkers: false })
    directionsServiceRef.current.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result: any, status: any) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          directionsRendererRef.current?.setDirections(result)
          if (result.routes?.[0]?.bounds) {
            mapRef.current?.fitBounds(result.routes[0].bounds)
          }
        } else {
          directionsRendererRef.current?.setMap(null)
          alert('Não foi possível traçar o roteiro com os endereços atuais.')
        }
      }
    )
  }

  const gerente = loggedUser?.cargo === 'gerente'
  const userId = loggedUser?.id

  const clientesVisiveis = useMemo(
    () => (gerente ? clientes : clientes.filter(c => c.vendedorId === userId)),
    [clientes, gerente, userId]
  )
  const pedidosVisiveis = useMemo(
    () => (gerente ? pedidos : pedidos.filter(p => p.vendedorId === userId)),
    [pedidos, gerente, userId]
  )
  const tarefasVisiveis = useMemo(
    () => (gerente ? tarefas : tarefas.filter(t => t.vendedorId === userId)),
    [tarefas, gerente, userId]
  )

  const ativos = useMemo(() => clientesVisiveis.filter(c => c.etapa !== 'perdido'), [clientesVisiveis])
  const prospectos = useMemo(() => clientesVisiveis.filter(c => c.etapa === 'prospecção'), [clientesVisiveis])

  const volumePorEstado = useMemo(() => {
    const map = new Map<string, number>()
    pedidosVisiveis
      .filter(p => p.status === 'confirmado')
      .forEach(p => {
        const c = clientes.find(cli => cli.id === p.clienteId)
        const uf = c?.enderecoEstado
        if (!uf) return
        map.set(uf, (map.get(uf) || 0) + p.totalValor)
      })
    return Array.from(map.entries())
      .map(([uf, valor]) => ({ uf, valor }))
      .sort((a, b) => b.valor - a.valor)
  }, [pedidosVisiveis, clientes])

  const potencialPorEstado = useMemo(() => {
    const map = new Map<string, number>()
    ativos.forEach(c => {
      const uf = c.enderecoEstado
      if (!uf) return
      const val = c.valorEstimado || c.valorProposta || 0
      if (val > 0) map.set(uf, (map.get(uf) || 0) + val)
    })
    return Array.from(map.entries())
      .map(([uf, valor]) => ({ uf, valor }))
      .filter(d => d.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
  }, [ativos])

  const rotas = useMemo(
    () => tarefasVisiveis
      .filter(t => t.tipo === 'reuniao' && t.status !== 'concluida')
      .sort((a, b) => (a.data || '').localeCompare(b.data || '')),
    [tarefasVisiveis]
  )

  const vendedoresLista = useMemo(() => {
    const v = vendedores.filter(x => x.cargo === 'vendedor')
    return v.length > 0 ? v : vendedores
  }, [vendedores])

  const representantesLista = useMemo(() => {
    const r = vendedores.filter(x => x.cargo !== 'gerente')
    return r
  }, [vendedores])

  function enderecoCompleto(c: Cliente) {
    return [
      c.enderecoRua && c.enderecoNumero ? `${c.enderecoRua}, ${c.enderecoNumero}` : c.enderecoRua || c.endereco || '',
      c.enderecoBairro || '',
      c.enderecoCidade || '',
      c.enderecoEstado || '',
    ].filter(Boolean).join(', ')
  }

  async function criarRoteiroIA() {
    const selecionados = ativos.filter(c => routeIds.has(c.id))
    if (selecionados.length < 2) return
    setRouteLoading(true)
    try {
      const systemInstruction = `Você é um roteirista comercial. Dada uma lista de clientes com cidade/UF, score e valor estimado, ordene-os em um roteiro de visitas eficiente que minimize deslocamento e priorize potencial. Responda APENAS com um JSON array de números inteiros (IDs dos clientes) na ordem recomendada, sem explicações.`
      const lista = selecionados
        .map(c => `${c.id}|${c.razaoSocial}|${c.enderecoCidade || ''}/${c.enderecoEstado || ''}|score:${c.score || 0}|valor:${c.valorEstimado || 0}`)
        .join('\n')
      const resposta = await callAI([{ role: 'user', content: `Crie a melhor ordem de visitas para os clientes abaixo. Responda apenas o JSON array de IDs:\n${lista}` }], systemInstruction)
      const match = resposta.match(/\[[\s\S]*?\]/)
      const ordem: number[] = match ? JSON.parse(match[0]) : JSON.parse(resposta)
      setRouteOrder(ordem)
    } catch {
      const fallback = [...selecionados].sort((a, b) => {
        const cmp = (a.enderecoEstado || '').localeCompare(b.enderecoEstado || '')
        if (cmp !== 0) return cmp
        return (a.enderecoCidade || '').localeCompare(b.enderecoCidade || '')
      })
      setRouteOrder(fallback.map(c => c.id))
    } finally {
      setRouteLoading(false)
    }
  }

  useEffect(() => {
    if (mapLoaded || typeof document === 'undefined') return
    if (window.google?.maps) {
      setMapLoaded(true)
      return
    }
    const existing = document.getElementById('google-maps-sdk') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => setMapLoaded(true), { once: true })
      return
    }
    const key = (import.meta.env as any).VITE_GOOGLE_MAPS_API_KEY
    if (!key) {
      console.warn('VITE_GOOGLE_MAPS_API_KEY não configurada')
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps-sdk'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap`
    script.async = true
    script.defer = true
    window.initMap = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [mapLoaded])

  useEffect(() => {
    if (!mapLoaded || !mapDivRef.current || mapRef.current) return
    const google = window.google
    if (!google?.maps || !google.maps.Map) return
    const center = coords ? { lat: coords.lat, lng: coords.lon } : { lat: -14.235, lng: -51.925 }
    const zoom = coords ? 18 : 4
    mapRef.current = new google.maps.Map(mapDivRef.current, { center, zoom, mapTypeId: 'roadmap' })
  }, [mapLoaded])

  useEffect(() => {
    if (!mapRef.current || !coords) return
    const google = window.google
    if (!google?.maps) return
    const position = { lat: coords.lat, lng: coords.lon }
    mapRef.current.setCenter(position)
    mapRef.current.setZoom(18)
    if (selectedMarkerRef.current) selectedMarkerRef.current.setMap(null)
    selectedMarkerRef.current = new google.maps.Marker({ position, map: mapRef.current, title: 'Cliente selecionado' })
  }, [coords])

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return
    const google = window.google
    layerMarkersRef.current.forEach(m => m.setMap(null))
    layerMarkersRef.current = []
    const items: { lat: number; lon: number; title: string }[] = []
    if (layer === 'ativos') {
      items.push(...ativos.filter(c => c.latitude && c.longitude).map(c => ({ lat: c.latitude!, lon: c.longitude!, title: c.razaoSocial })))
    } else if (layer === 'prospectos') {
      items.push(...prospectos.filter(c => c.latitude && c.longitude).map(c => ({ lat: c.latitude!, lon: c.longitude!, title: c.razaoSocial })))
    }
    items.forEach(p => {
      layerMarkersRef.current.push(new google.maps.Marker({ position: { lat: p.lat, lng: p.lon }, map: mapRef.current, title: p.title }))
    })
  }, [mapLoaded, layer, ativos, prospectos])

  const layers: { id: Layer; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'ativos', label: 'Ativos', icon: UserGroupIcon, count: ativos.length },
    { id: 'prospectos', label: 'Prospectos', icon: UserPlusIcon, count: prospectos.length },
    ...(gerente ? [{ id: 'vendedores' as Layer, label: 'Vendedores', icon: BriefcaseIcon, count: vendedoresLista.length }] : []),
    ...(gerente ? [{ id: 'representantes' as Layer, label: 'Representantes', icon: StarIcon, count: representantesLista.length }] : []),
    { id: 'rotas', label: 'Rotas', icon: TruckIcon, count: rotas.length },
    { id: 'roteiro', label: 'Roteiro', icon: MapIcon, count: routeIds.size },
    { id: 'volume', label: 'Volume', icon: CurrencyDollarIcon },
    { id: 'potencial', label: 'Potencial', icon: ChartBarIcon },
  ]

  const renderList = () => {
    if (layer === 'ativos') {
      return (
        <div className="space-y-2">
          {ativos.map(c => (
            <button
              key={c.id}
              onClick={() => selectCliente(c)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${selectedId === c.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <p className="text-sm font-semibold text-gray-900 truncate">{c.razaoSocial}</p>
              <p className="text-xs text-gray-500 truncate">{c.enderecoCidade || c.enderecoEstado || 'Sem localização'} · {c.etapa}</p>
            </button>
          ))}
          {ativos.length === 0 && <p className="text-sm text-gray-400">Nenhum cliente ativo.</p>}
        </div>
      )
    }
    if (layer === 'prospectos') {
      return (
        <div className="space-y-2">
          {prospectos.map(c => (
            <button
              key={c.id}
              onClick={() => selectCliente(c)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${selectedId === c.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <p className="text-sm font-semibold text-gray-900 truncate">{c.razaoSocial}</p>
              <p className="text-xs text-gray-500 truncate">{c.enderecoCidade || c.enderecoEstado || 'Sem localização'} · Potencial: {fmtBRL(c.valorEstimado || 0)}</p>
            </button>
          ))}
          {prospectos.length === 0 && <p className="text-sm text-gray-400">Nenhum prospecto.</p>}
        </div>
      )
    }
    if (layer === 'vendedores' || layer === 'representantes') {
      const list = layer === 'vendedores' ? vendedoresLista : representantesLista
      return (
        <div className="space-y-2">
          {list.map(v => {
            const fat = pedidosVisiveis.filter(p => p.vendedorId === v.id && p.status === 'confirmado').reduce((s, p) => s + p.totalValor, 0)
            const carteira = clientesVisiveis.filter(c => c.vendedorId === v.id).length
            return (
              <div key={v.id} className="p-3 rounded-xl border border-gray-200 bg-white">
                <p className="text-sm font-semibold text-gray-900">{v.nome}</p>
                <p className="text-xs text-gray-500">{v.cargo} · {carteira} clientes · {fmtBRL(fat)} vendido</p>
              </div>
            )
          })}
          {list.length === 0 && <p className="text-sm text-gray-400">Nenhum registro.</p>}
        </div>
      )
    }
    if (layer === 'rotas') {
      return (
        <div className="space-y-2">
          {rotas.map(t => {
            const c = clientes.find(cli => cli.id === t.clienteId)
            return (
              <button
                key={t.id}
                onClick={() => c && selectCliente(c)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${selectedId === c?.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="text-sm font-semibold text-gray-900">{t.titulo}</p>
                <p className="text-xs text-gray-500">{t.data} {t.hora ? `· ${t.hora}` : ''} · {c?.razaoSocial || 'Cliente não informado'}</p>
              </button>
            )
          })}
          {rotas.length === 0 && <p className="text-sm text-gray-400">Nenhuma rota/visita pendente.</p>}
        </div>
      )
    }
    if (layer === 'roteiro') {
      const candidates = ativos.filter(c => c.enderecoCidade || c.enderecoEstado)
      const routeClientes = routeOrder?.map(id => ativos.find(c => c.id === id)).filter((c): c is Cliente => !!c) || []
      const podeExibirRota = routeClientes.length >= 2
      return (
        <div className="space-y-3">
          {routeOrder ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary-700 uppercase">Roteiro sugerido pela IA</p>
              {routeClientes.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => selectCliente(c)}
                  className="w-full text-left p-3 rounded-xl border border-primary-200 bg-primary-50">
                  <p className="text-sm font-semibold text-gray-900">{i + 1}. {c.razaoSocial}</p>
                  <p className="text-xs text-gray-500">{c.enderecoCidade || ''} {c.enderecoEstado || ''}</p>
                </button>
              ))}
              <div className="flex gap-2">
                {podeExibirRota && (
                  <button onClick={exibirRoteiroNoMapa} className="flex-1 text-center px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Ver roteiro no mapa</button>
                )}
                <button onClick={() => { setRouteOrder(null); setRouteIds(new Set()) }} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Refazer</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{routeIds.size} selecionado(s)</span>
                <div className="flex gap-2">
                  <button onClick={() => setRouteIds(new Set(candidates.map(c => c.id)))} className="text-primary-600 hover:underline">Marcar todos</button>
                  <button onClick={() => setRouteIds(new Set())} className="text-gray-500 hover:underline">Limpar</button>
                </div>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {candidates.map(c => {
                  const checked = routeIds.has(c.id)
                  return (
                    <label key={c.id} className="flex items-start gap-2 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(routeIds)
                          if (checked) next.delete(c.id)
                          else next.add(c.id)
                          setRouteIds(next)
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{c.razaoSocial}</p>
                        <p className="text-xs text-gray-500 truncate">{c.enderecoCidade || c.enderecoEstado || 'Sem localização'}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
              <button
                onClick={criarRoteiroIA}
                disabled={routeIds.size < 2 || routeLoading}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:bg-gray-400 transition-colors">
                {routeLoading ? 'Calculando roteiro...' : 'Gerar roteiro com IA'}
              </button>
              {candidates.length === 0 && <p className="text-sm text-gray-400">Nenhum cliente com localização.</p>}
            </>
          )}
        </div>
      )
    }
    return null
  }

  const chartData = layer === 'volume' ? volumePorEstado : layer === 'potencial' ? potencialPorEstado : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Mapa Comercial</h2>
          <p className="text-sm text-gray-600">Visão geográfica de clientes, vendedores, rotas e potencial.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Camadas</p>
            <div className="flex flex-wrap gap-2">
              {layers.map(l => {
                const Icon = l.icon
                return (
                  <button
                    key={l.id}
                    onClick={() => { setLayer(l.id); setSelectedId(null) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${layer === l.id ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {l.label}
                    {l.count !== undefined && <span className="ml-1 bg-white text-gray-700 px-1.5 rounded-full">{l.count}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 p-4 max-h-[480px] overflow-y-auto">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              {layer === 'ativos' && 'Clientes ativos'}
              {layer === 'prospectos' && 'Prospectos'}
              {layer === 'vendedores' && 'Vendedores'}
              {layer === 'representantes' && 'Representantes'}
              {layer === 'rotas' && 'Rotas / Visitas'}
              {layer === 'roteiro' && 'Criar roteiro com IA'}
              {layer === 'volume' && 'Volume vendido por estado'}
              {layer === 'potencial' && 'Potencial por estado'}
            </p>

            {(layer === 'volume' || layer === 'potencial') ? (
              <div className="h-56">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="uf" type="category" tick={{ fontSize: 10 }} width={30} />
                      <Tooltip formatter={(v: number) => [fmtBRL(v), layer === 'volume' ? 'Vendas' : 'Potencial']} />
                      <Bar dataKey="valor" fill={layer === 'volume' ? '#22C55E' : '#3B82F6'} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 h-full flex items-center justify-center">Sem dados no período.</p>
                )}
              </div>
            ) : (
              renderList()
            )}
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-apple shadow-apple-sm border border-gray-200 overflow-hidden" style={{ height: 520 }}>
            <div ref={mapDivRef} className="w-full h-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Clientes ativos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Prospectos</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Vendedores</span>
            <span className="flex items-center gap-1"><MapPinIcon className="h-3 w-3" /> Clique em um item para centralizar o mapa</span>
          </div>
        </div>
      </div>
    </div>
  )
}
