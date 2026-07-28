import { Router } from 'express'
import { CONFIG } from '../config.js'

export const mapsRouter = Router()

const BASE = 'https://maps.googleapis.com/maps/api'

mapsRouter.use((req, res, next) => {
  if (!CONFIG.googleMapsApiKey) {
    res.status(500).json({ success: false, error: 'Google Maps API key não configurada no backend.' })
    return
  }
  next()
})

mapsRouter.get('/geocode', async (req, res) => {
  try {
    const { address } = req.query as Record<string, string>
    if (!address?.trim()) {
      res.status(400).json({ success: false, error: 'address é obrigatório' })
      return
    }
    const url = new URL(`${BASE}/geocode/json`)
    url.searchParams.set('address', address)
    url.searchParams.set('region', 'br')
    url.searchParams.set('components', 'country:BR')
    url.searchParams.set('language', 'pt-BR')
    url.searchParams.set('key', CONFIG.googleMapsApiKey!)

    const r = await fetch(url.toString())
    const data = await r.json() as any

    if (data.status !== 'OK') {
      res.json({ success: true, results: [], status: data.status })
      return
    }

    const results = (data.results || []).map((r: any) => ({
      formattedAddress: r.formatted_address,
      placeId: r.place_id,
      location: r.geometry?.location,
      viewport: r.geometry?.viewport,
      types: r.types,
    }))
    res.json({ success: true, results, status: data.status })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro no geocoding' })
  }
})

mapsRouter.get('/directions', async (req, res) => {
  try {
    const { origin, destination, waypoints, mode = 'driving', units = 'metric', language = 'pt-BR' } = req.query as Record<string, string>
    if (!origin || !destination) {
      res.status(400).json({ success: false, error: 'origin e destination são obrigatórios' })
      return
    }
    const url = new URL(`${BASE}/directions/json`)
    url.searchParams.set('origin', origin)
    url.searchParams.set('destination', destination)
    url.searchParams.set('mode', mode)
    url.searchParams.set('units', units)
    url.searchParams.set('language', language)
    url.searchParams.set('key', CONFIG.googleMapsApiKey!)
    if (waypoints) url.searchParams.set('waypoints', waypoints)

    const r = await fetch(url.toString())
    const data = await r.json() as any

    if (data.status !== 'OK') {
      res.json({ success: true, routes: [], status: data.status })
      return
    }

    const routes = (data.routes || []).map((route: any) => ({
      summary: route.summary,
      overviewPolyline: route.overview_polyline,
      legs: (route.legs || []).map((leg: any) => ({
        distance: leg.distance,
        duration: leg.duration,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        steps: (leg.steps || []).map((s: any) => ({
          distance: s.distance,
          duration: s.duration,
          instructions: s.html_instructions,
          travelMode: s.travel_mode,
          polyline: s.polyline?.points,
        })),
      })),
    }))
    res.json({ success: true, routes, status: data.status })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erro no directions' })
  }
})
