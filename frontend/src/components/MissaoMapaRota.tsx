import React, { useEffect, useRef, useState } from 'react'
import type { CoordenadaGeo } from '../utils/missaoCalculos'

export interface PontoMapaMissao {
  id: number | string
  ordemGlobal: number
  diaNumero: number
  titulo: string
  subtitulo?: string
  status: 'origem' | 'visitado' | 'pendente' | 'nao_visitado'
  coord: CoordenadaGeo | null
}

interface Props {
  origem?: { nome: string; coord: CoordenadaGeo | null }
  retorno?: { nome: string; coord: CoordenadaGeo | null }
  pontos: PontoMapaMissao[]
  onKmRodoviarioReal?: (km: number) => void
}

const COR_STATUS: Record<PontoMapaMissao['status'], string> = {
  origem: '#1D1D1F',
  visitado: '#16A34A',
  pendente: '#2563EB',
  nao_visitado: '#DC2626',
}

export default function MissaoMapaRota({ origem, retorno, pontos, onKmRodoviarioReal }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkMissingKey, setSdkMissingKey] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const w = window as any
    if (w.google?.maps) {
      setSdkReady(true)
      return
    }
    const existing = document.getElementById('google-maps-sdk') as HTMLScriptElement | null
    if (existing) {
      const onLoad = () => setSdkReady(true)
      existing.addEventListener('load', onLoad, { once: true })
      return () => existing.removeEventListener('load', onLoad)
    }
    const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY
    if (!key) {
      setSdkMissingKey(true)
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps-sdk'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => setSdkReady(true)
    script.onerror = () => setSdkMissingKey(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!sdkReady || !mapDivRef.current) return
    const g = (window as any).google?.maps
    if (!g) return

    if (!mapRef.current) {
      mapRef.current = new g.Map(mapDivRef.current, {
        center: { lat: -19.9167, lng: -43.9345 },
        zoom: 7,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })
    }

    // Limpar marcadores e linhas anteriores
    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null }
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null }

    const bounds = new g.LatLngBounds()
    const sequenciaCoords: { lat: number; lng: number }[] = []

    const addPin = (coord: CoordenadaGeo, label: string, title: string, cor: string) => {
      const pos = { lat: coord.lat, lng: coord.lon }
      bounds.extend(pos)
      sequenciaCoords.push(pos)
      const marker = new g.Marker({
        position: pos,
        map: mapRef.current,
        title,
        label: {
          text: label,
          color: '#FFFFFF',
          fontSize: '11px',
          fontWeight: '700',
        },
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: cor,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      })
      markersRef.current.push(marker)
    }

    if (origem?.coord) {
      addPin(origem.coord, 'S', `Saída: ${origem.nome || 'Origem'}`, COR_STATUS.origem)
    }

    pontos.forEach((p, idx) => {
      if (!p.coord) return
      addPin(
        p.coord,
        String(idx + 1),
        `#${idx + 1} (Dia ${p.diaNumero}) — ${p.titulo}${p.subtitulo ? ` · ${p.subtitulo}` : ''}`,
        COR_STATUS[p.status],
      )
    })

    const retCoord = retorno?.coord || origem?.coord || null
    if (retCoord && pontos.some(p => p.coord)) {
      sequenciaCoords.push({ lat: retCoord.lat, lng: retCoord.lon })
      bounds.extend({ lat: retCoord.lat, lng: retCoord.lon })
    }

    if (sequenciaCoords.length === 1) {
      mapRef.current.setCenter(sequenciaCoords[0])
      mapRef.current.setZoom(12)
    } else if (sequenciaCoords.length >= 2) {
      mapRef.current.fitBounds(bounds)

      // Linha base imediata conectando a ordem exata das visitas
      polylineRef.current = new g.Polyline({
        path: sequenciaCoords,
        geodesic: true,
        strokeColor: '#1B2A5C',
        strokeOpacity: 0.75,
        strokeWeight: 3,
        map: mapRef.current,
      })

      // Se houver até 23 pontos intermediários, traça rota rodoviária real no Google Directions
      if (sequenciaCoords.length <= 25 && g.DirectionsService && g.DirectionsRenderer) {
        const ds = new g.DirectionsService()
        const dr = new g.DirectionsRenderer({
          map: mapRef.current,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#1B2A5C',
            strokeOpacity: 0.9,
            strokeWeight: 4,
          },
        })
        directionsRendererRef.current = dr
        ds.route(
          {
            origin: sequenciaCoords[0],
            destination: sequenciaCoords[sequenciaCoords.length - 1],
            waypoints: sequenciaCoords.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
            travelMode: g.TravelMode.DRIVING,
            optimizeWaypoints: false,
          },
          (result: any, status: string) => {
            if (status === 'OK' && result?.routes?.[0]) {
              if (polylineRef.current) polylineRef.current.setMap(null)
              dr.setDirections(result)
              const legs = result.routes[0].legs || []
              const metros = legs.reduce((acc: number, l: any) => acc + Number(l.distance?.value || 0), 0)
              if (metros > 0 && onKmRodoviarioReal) {
                onKmRodoviarioReal(Math.round((metros / 1000) * 10) / 10)
              }
            }
          },
        )
      }
    }
  }, [sdkReady, origem?.coord?.lat, origem?.coord?.lon, retorno?.coord?.lat, retorno?.coord?.lon, JSON.stringify(pontos.map(p => [p.id, p.diaNumero, p.ordemGlobal, p.status, p.coord?.lat, p.coord?.lon]))])

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]" /> Visitado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" /> Pendente
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]" /> Não visitado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1D1D1F]" /> Saída/Retorno
          </span>
        </div>
        <span className="text-[11px] text-gray-400">
          {pontos.filter(p => p.coord).length}/{pontos.length} ponto(s) geolocalizado(s)
        </span>
      </div>

      {sdkMissingKey ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-4">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Sequência da rota ({origem?.nome || 'Saída'} → {pontos.length} parada(s) → {retorno?.nome || origem?.nome || 'Retorno'})
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {origem?.nome && (
              <span className="px-2 py-1 rounded-md bg-gray-900 text-white font-medium">Saída: {origem.nome}</span>
            )}
            {pontos.map((p, idx) => (
              <React.Fragment key={p.id}>
                <span className="text-gray-400">→</span>
                <span
                  className="px-2 py-1 rounded-md text-white font-medium"
                  style={{ backgroundColor: COR_STATUS[p.status] }}
                >
                  {idx + 1}. {p.titulo}
                </span>
              </React.Fragment>
            ))}
            {(retorno?.nome || origem?.nome) && pontos.length > 0 && (
              <>
                <span className="text-gray-400">→</span>
                <span className="px-2 py-1 rounded-md bg-gray-900 text-white font-medium">
                  Retorno: {retorno?.nome || origem?.nome}
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={mapDivRef}
          className="w-full h-72 sm:h-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 overflow-hidden"
        />
      )}
    </div>
  )
}
