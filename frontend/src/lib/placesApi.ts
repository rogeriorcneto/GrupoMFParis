import { BOT_URL } from './botApi'

async function authFetch(url: string) {
  const { supabase } = await import('./supabase')
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}

export interface PlacesPrediction {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
}

export interface PlacesDetails {
  placeId: string
  name: string
  address: string
  phone?: string
  website?: string
  googleMapsUrl?: string
  rating?: number
  totalRatings?: number
  openingHours?: string[]
  isOpen?: boolean
  businessStatus?: string
  types?: string[]
  location?: { lat: number; lng: number }
  street?: string
  streetNumber?: string
  neighborhood?: string
  city?: string
  state?: string
  postalCode?: string
  photoRefs?: string[]
}

export interface PlacesSearchResult {
  place_id: string
  name: string
  formatted_address?: string
  vicinity?: string
  rating?: number
  user_ratings_total?: number
  types?: string[]
  business_status?: string
  geometry: { location: { lat: number; lng: number } }
  photos?: { photo_reference: string }[]
}

/** Autocomplete de endereço/empresa */
export async function placesAutocomplete(input: string, sessiontoken?: string): Promise<PlacesPrediction[]> {
  try {
    const params = new URLSearchParams({ input })
    if (sessiontoken) params.set('sessiontoken', sessiontoken)
    const r = await authFetch(`${BOT_URL}/api/places/autocomplete?${params}`)
    const data = await r.json()
    return data.predictions || []
  } catch { return [] }
}

/** Detalhes completos de um lugar (enriquecimento) */
export async function placesDetails(placeId: string, sessiontoken?: string): Promise<PlacesDetails | null> {
  try {
    const params = new URLSearchParams({ placeId })
    if (sessiontoken) params.set('sessiontoken', sessiontoken)
    const r = await authFetch(`${BOT_URL}/api/places/details?${params}`)
    return await r.json()
  } catch { return null }
}

/** Busca textual de empresas no Google Maps */
export async function placesSearch(query: string, location?: string, radius?: number): Promise<PlacesSearchResult[]> {
  try {
    const params = new URLSearchParams({ query })
    if (location) { params.set('location', location); params.set('radius', String(radius || 5000)) }
    const r = await authFetch(`${BOT_URL}/api/places/search?${params}`)
    const data = await r.json()
    return data.results || []
  } catch { return [] }
}

/** URL de foto via nosso proxy (não expõe a API key) */
export function placesPhotoUrl(ref: string, maxwidth = 400): string {
  return `${BOT_URL}/api/places/photo?ref=${encodeURIComponent(ref)}&maxwidth=${maxwidth}`
}
