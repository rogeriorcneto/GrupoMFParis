import React, { useState, useCallback, useRef } from 'react'
import { MagnifyingGlassIcon, SparklesIcon, CheckIcon, XMarkIcon, StarIcon, GlobeAltIcon, PhoneIcon, MapPinIcon, ClockIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { placesSearch, placesDetails, placesPhotoUrl, type PlacesSearchResult, type PlacesDetails } from '../lib/placesApi'

interface EnrichData {
  phone?: string
  website?: string
  googleMapsUrl?: string
  rating?: number
  totalRatings?: number
  openingHours?: string[]
  isOpen?: boolean
  street?: string
  streetNumber?: string
  neighborhood?: string
  city?: string
  state?: string
  postalCode?: string
  photoRef?: string
  instagramHint?: string
}

interface Props {
  razaoSocial: string
  cidade?: string
  onApply: (data: EnrichData) => void
}

function extractInstagram(website?: string): string | undefined {
  if (!website) return undefined
  if (website.includes('instagram.com')) return website
  return undefined
}

export const PlacesEnrich: React.FC<Props> = ({ razaoSocial, cidade, onApply }) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PlacesSearchResult[]>([])
  const [selected, setSelected] = useState<PlacesDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [applied, setApplied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleOpen = () => {
    setOpen(true)
    const q = [razaoSocial, cidade].filter(Boolean).join(' ')
    setQuery(q)
    setTimeout(() => inputRef.current?.focus(), 50)
    if (q.trim()) handleSearch(q)
  }

  const handleSearch = useCallback(async (q: string) => {
    const term = q.trim()
    if (!term) return
    setLoading(true)
    setSelected(null)
    setResults([])
    const loc = cidade ? undefined : undefined
    const res = await placesSearch(term, loc)
    setResults(res.slice(0, 6))
    setLoading(false)
  }, [cidade])

  const handleSelect = async (r: PlacesSearchResult) => {
    setLoadingDetails(true)
    setSelected(null)
    const details = await placesDetails(r.place_id)
    if (details) {
      details.photoRefs = (r.photos || []).slice(0, 3).map(p => p.photo_reference)
        .concat(details.photoRefs || []).slice(0, 3)
    }
    setSelected(details)
    setLoadingDetails(false)
  }

  const handleApply = () => {
    if (!selected) return
    const data: EnrichData = {
      phone: selected.phone,
      website: selected.website,
      googleMapsUrl: selected.googleMapsUrl,
      rating: selected.rating,
      totalRatings: selected.totalRatings,
      openingHours: selected.openingHours,
      isOpen: selected.isOpen,
      street: selected.street,
      streetNumber: selected.streetNumber,
      neighborhood: selected.neighborhood,
      city: selected.city,
      state: selected.state,
      postalCode: selected.postalCode,
      photoRef: selected.photoRefs?.[0],
      instagramHint: extractInstagram(selected.website),
    }
    onApply(data)
    setApplied(true)
    setTimeout(() => { setApplied(false); setOpen(false); setSelected(null); setResults([]) }, 1200)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition-all"
        title="Buscar dados no Google Places (telefone, site, endereço, horários)"
      >
        <SparklesIcon className="h-3.5 w-3.5" />
        Enriquecer com Google
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
          <SparklesIcon className="h-4 w-4" />
          Enriquecer com Google Places
        </p>
        <button type="button" onClick={() => { setOpen(false); setSelected(null); setResults([]) }} className="text-gray-400 hover:text-gray-600">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(query) } }}
          className="flex-1 px-3 py-2 text-sm border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          placeholder="Ex: Supermercado BH São Paulo"
        />
        <button
          type="button"
          onClick={() => handleSearch(query)}
          disabled={loading}
          className="px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? '⏳' : <MagnifyingGlassIcon className="h-4 w-4" />}
        </button>
      </div>

      {/* Results list */}
      {!selected && results.length > 0 && (
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
            >
              <p className="text-sm font-semibold text-gray-800">{r.name}</p>
              <p className="text-xs text-gray-500 truncate">{r.formatted_address || r.vicinity}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {r.rating && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                    <StarIcon className="h-3 w-3" /> {r.rating} ({r.user_ratings_total?.toLocaleString('pt-BR')})
                  </span>
                )}
                {r.business_status === 'OPERATIONAL' && (
                  <span className="text-xs text-green-600 font-medium">● Ativo</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Loading details */}
      {loadingDetails && (
        <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
          <span className="animate-spin">⏳</span> Carregando detalhes...
        </div>
      )}

      {/* Details panel */}
      {selected && !loadingDetails && (
        <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-2">
          <p className="text-sm font-bold text-gray-900">{selected.name}</p>

          {/* Photo strip */}
          {selected.photoRefs && selected.photoRefs.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {selected.photoRefs.map((ref, i) => (
                <img
                  key={i}
                  src={placesPhotoUrl(ref, 120)}
                  alt=""
                  className="h-16 w-24 object-cover rounded-lg flex-shrink-0 border border-gray-100"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ))}
              {selected.photoRefs.length === 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <PhotoIcon className="h-4 w-4" /> Sem fotos
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-1.5 text-xs text-gray-700">
            {selected.phone && (
              <div className="flex items-center gap-1.5">
                <PhoneIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                <span className="font-medium">{selected.phone}</span>
              </div>
            )}
            {selected.website && (
              <div className="flex items-center gap-1.5">
                <GlobeAltIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                <a href={selected.website} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate max-w-xs">
                  {selected.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {selected.address && (
              <div className="flex items-start gap-1.5">
                <MapPinIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span>{selected.address}</span>
              </div>
            )}
            {selected.rating && (
              <div className="flex items-center gap-1.5">
                <StarIcon className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                <span className="font-semibold text-amber-700">{selected.rating}</span>
                <span className="text-gray-400">({selected.totalRatings?.toLocaleString('pt-BR')} avaliações)</span>
              </div>
            )}
            {selected.openingHours && selected.openingHours.length > 0 && (
              <div className="flex items-start gap-1.5">
                <ClockIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className={`font-semibold ${selected.isOpen ? 'text-green-600' : 'text-red-500'}`}>
                    {selected.isOpen ? 'Aberto agora' : 'Fechado agora'}
                  </span>
                  <div className="text-gray-500 mt-0.5 space-y-0.5">
                    {selected.openingHours.map((h, i) => <p key={i}>{h}</p>)}
                  </div>
                </div>
              </div>
            )}
            {selected.website?.includes('instagram.com') && (
              <div className="flex items-center gap-1.5">
                <span className="text-pink-500 text-sm">📸</span>
                <a href={selected.website} target="_blank" rel="noopener noreferrer"
                  className="text-pink-600 hover:underline truncate">
                  Instagram: {selected.website}
                </a>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setSelected(null) }}
              className="flex-1 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                applied ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {applied ? <><CheckIcon className="h-3.5 w-3.5" /> Aplicado!</> : '✅ Aplicar ao cadastro'}
            </button>
          </div>
        </div>
      )}

      {!loading && !loadingDetails && results.length === 0 && query && (
        <p className="text-xs text-gray-500 text-center py-2">Nenhum resultado. Tente refinar a busca.</p>
      )}
    </div>
  )
}
