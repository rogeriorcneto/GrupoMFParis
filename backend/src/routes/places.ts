import { Router } from 'express'
import { CONFIG } from '../config.js'

export const placesRouter = Router()

const BASE = 'https://maps.googleapis.com/maps/api'

// ── GET /api/places/autocomplete?input=...&sessiontoken=...
placesRouter.get('/autocomplete', async (req, res) => {
  const { input, sessiontoken, language = 'pt-BR', components = 'country:br' } = req.query as Record<string, string>
  if (!input?.trim()) { res.json({ predictions: [] }); return }
  try {
    const url = new URL(`${BASE}/place/autocomplete/json`)
    url.searchParams.set('input', input)
    url.searchParams.set('language', language)
    url.searchParams.set('components', components)
    url.searchParams.set('key', CONFIG.googlePlacesKey)
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken)
    const r = await fetch(url.toString())
    const data = await r.json() as any
    res.json({ predictions: data.predictions || [] })
  } catch (err: any) {
    res.status(500).json({ error: err.message, predictions: [] })
  }
})

// ── GET /api/places/search?query=...&location=lat,lng&radius=5000
placesRouter.get('/search', async (req, res) => {
  const { query, location, radius = '5000', type, language = 'pt-BR' } = req.query as Record<string, string>
  if (!query?.trim()) { res.json({ results: [] }); return }
  try {
    const url = new URL(`${BASE}/place/textsearch/json`)
    url.searchParams.set('query', query)
    url.searchParams.set('language', language)
    url.searchParams.set('key', CONFIG.googlePlacesKey)
    if (location) { url.searchParams.set('location', location); url.searchParams.set('radius', radius) }
    if (type) url.searchParams.set('type', type)
    const r = await fetch(url.toString())
    const data = await r.json() as any
    res.json({ results: data.results || [], next_page_token: data.next_page_token, status: data.status })
  } catch (err: any) {
    res.status(500).json({ error: err.message, results: [] })
  }
})

// ── GET /api/places/details?placeId=...
// Returns full enrichment: phone, website, opening_hours, rating, photos, social hints
placesRouter.get('/details', async (req, res) => {
  const { placeId, sessiontoken, language = 'pt-BR' } = req.query as Record<string, string>
  if (!placeId) { res.status(400).json({ error: 'placeId required' }); return }
  try {
    const fields = [
      'name', 'formatted_address', 'formatted_phone_number', 'international_phone_number',
      'website', 'url', 'rating', 'user_ratings_total', 'opening_hours',
      'geometry', 'types', 'business_status', 'photos',
      'address_components', 'plus_code',
    ].join(',')

    const url = new URL(`${BASE}/place/details/json`)
    url.searchParams.set('place_id', placeId)
    url.searchParams.set('fields', fields)
    url.searchParams.set('language', language)
    url.searchParams.set('key', CONFIG.googlePlacesKey)
    if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken)

    const r = await fetch(url.toString())
    const data = await r.json() as any
    const p = data.result || {}

    // Extract address components helper
    const getComp = (type: string) =>
      (p.address_components || []).find((c: any) => c.types.includes(type))?.long_name

    // Build photo URLs (proxy through our backend to avoid exposing key)
    const photoRefs: string[] = (p.photos || []).slice(0, 5).map((ph: any) => ph.photo_reference)

    res.json({
      placeId,
      name: p.name,
      address: p.formatted_address,
      phone: p.formatted_phone_number || p.international_phone_number,
      website: p.website,
      googleMapsUrl: p.url,
      rating: p.rating,
      totalRatings: p.user_ratings_total,
      openingHours: p.opening_hours?.weekday_text || [],
      isOpen: p.opening_hours?.open_now,
      businessStatus: p.business_status,
      types: p.types,
      location: p.geometry?.location,
      // Address breakdown
      street: getComp('route'),
      streetNumber: getComp('street_number'),
      neighborhood: getComp('sublocality') || getComp('sublocality_level_1'),
      city: getComp('administrative_area_level_2') || getComp('locality'),
      state: getComp('administrative_area_level_1'),
      postalCode: getComp('postal_code'),
      photoRefs,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/places/photo?ref=...&maxwidth=400
placesRouter.get('/photo', async (req, res) => {
  const { ref, maxwidth = '400' } = req.query as Record<string, string>
  if (!ref) { res.status(400).send('ref required'); return }
  try {
    const url = `${BASE}/place/photo?photoreference=${encodeURIComponent(ref)}&maxwidth=${maxwidth}&key=${CONFIG.googlePlacesKey}`
    const r = await fetch(url, { redirect: 'follow' })
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const buf = Buffer.from(await r.arrayBuffer())
    res.send(buf)
  } catch (err: any) {
    res.status(500).send(err.message)
  }
})
