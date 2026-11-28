import { normalizarTextoCidade, type CoordenadaGeo } from './missaoCalculos'

const CACHE_KEY = 'crm_cidades_coords_cache_v1'

/**
 * Coordenadas pré-carregadas de cidades estratégicas (MG, SP, RJ, ES, GO, DF, BA, PR, SC, RS e capitais)
 * para filtro instantâneo por raio (ex.: 50 km) e cálculo imediato de km do roteiro mesmo antes do geocoder externo.
 */
const CIDADES_BASE: Record<string, CoordenadaGeo> = {
  // Minas Gerais
  'belo horizonte|MG': { lat: -19.9167, lon: -43.9345 },
  'contagem|MG': { lat: -19.932, lon: -44.0539 },
  'betim|MG': { lat: -19.9678, lon: -44.1983 },
  'nova lima|MG': { lat: -19.9856, lon: -43.8467 },
  'santa luzia|MG': { lat: -19.7697, lon: -43.8514 },
  'ribeirao das neves|MG': { lat: -19.767, lon: -44.0869 },
  'sabara|MG': { lat: -19.8841, lon: -43.8267 },
  'ibirite|MG': { lat: -20.0219, lon: -44.0589 },
  'vespasiano|MG': { lat: -19.6919, lon: -43.9233 },
  'lagoa santa|MG': { lat: -19.6292, lon: -43.8897 },
  'sete lagoas|MG': { lat: -19.4658, lon: -44.2467 },
  'divinopolis|MG': { lat: -20.1386, lon: -44.8839 },
  'itauna|MG': { lat: -20.0753, lon: -44.5764 },
  'para de minas|MG': { lat: -19.86, lon: -44.6083 },
  'uberlandia|MG': { lat: -18.9186, lon: -48.2772 },
  'uberaba|MG': { lat: -19.7472, lon: -47.9319 },
  'araguari|MG': { lat: -18.6472, lon: -48.1872 },
  'ituiutaba|MG': { lat: -18.9689, lon: -49.465 },
  'patos de minas|MG': { lat: -18.5789, lon: -46.5181 },
  'patrocinio|MG': { lat: -18.9439, lon: -46.9925 },
  'araxa|MG': { lat: -19.5933, lon: -46.9406 },
  'frutal|MG': { lat: -20.0247, lon: -48.9406 },
  'monte carmelo|MG': { lat: -18.7247, lon: -47.4986 },
  'tupaciguara|MG': { lat: -18.5922, lon: -48.705 },
  'juiz de fora|MG': { lat: -21.7642, lon: -43.3503 },
  'barbacena|MG': { lat: -21.2258, lon: -43.7736 },
  'conselheiro lafaiete|MG': { lat: -20.6597, lon: -43.7856 },
  'sao joao del rei|MG': { lat: -21.1356, lon: -44.2617 },
  'uba|MG': { lat: -21.12, lon: -42.9428 },
  'muriae|MG': { lat: -21.1306, lon: -42.3664 },
  'cataguases|MG': { lat: -21.3892, lon: -42.6967 },
  'leopoldina|MG': { lat: -21.5319, lon: -42.6431 },
  'ipatinga|MG': { lat: -19.4683, lon: -42.5367 },
  'coronel fabriciano|MG': { lat: -19.5186, lon: -42.6289 },
  'timoteo|MG': { lat: -19.5825, lon: -42.6442 },
  'governador valadares|MG': { lat: -18.8511, lon: -41.9494 },
  'teofilo otoni|MG': { lat: -17.8575, lon: -41.5053 },
  'caratinga|MG': { lat: -19.7897, lon: -42.1392 },
  'manhuacu|MG': { lat: -20.2581, lon: -42.0336 },
  'joao monlevade|MG': { lat: -19.81, lon: -43.1736 },
  'itabira|MG': { lat: -19.6192, lon: -43.2269 },
  'ouro preto|MG': { lat: -20.3856, lon: -43.5036 },
  'mariana|MG': { lat: -20.3778, lon: -43.4161 },
  'montes claros|MG': { lat: -16.735, lon: -43.8617 },
  'janauba|MG': { lat: -15.8025, lon: -43.3089 },
  'pirapora|MG': { lat: -17.345, lon: -44.9419 },
  'paracatu|MG': { lat: -17.2222, lon: -46.8747 },
  'unai|MG': { lat: -16.3575, lon: -46.9061 },
  'pouso alegre|MG': { lat: -22.23, lon: -45.9364 },
  'pocos de caldas|MG': { lat: -21.7878, lon: -46.5614 },
  'varginha|MG': { lat: -21.5514, lon: -45.43 },
  'tres coracoes|MG': { lat: -21.6947, lon: -45.2553 },
  'lavras|MG': { lat: -21.2453, lon: -45.0008 },
  'alfenas|MG': { lat: -21.4292, lon: -45.9472 },
  'passos|MG': { lat: -20.7189, lon: -46.6097 },
  'itajuba|MG': { lat: -22.4256, lon: -45.4528 },
  'sao lourenco|MG': { lat: -22.1164, lon: -45.0539 },
  'formiga|MG': { lat: -20.4644, lon: -45.4264 },
  // São Paulo
  'sao paulo|SP': { lat: -23.5505, lon: -46.6333 },
  'guarulhos|SP': { lat: -23.4543, lon: -46.5337 },
  'campinas|SP': { lat: -22.9099, lon: -47.0626 },
  'vinhedo|SP': { lat: -23.0297, lon: -46.9753 },
  'jundiai|SP': { lat: -23.1857, lon: -46.8978 },
  'sorocaba|SP': { lat: -23.5015, lon: -47.4526 },
  'ribeirao preto|SP': { lat: -21.1704, lon: -47.8103 },
  'franca|SP': { lat: -20.5386, lon: -47.4008 },
  'sao jose do rio preto|SP': { lat: -20.8113, lon: -49.3758 },
  'bauru|SP': { lat: -22.3246, lon: -49.0871 },
  'marilia|SP': { lat: -22.2171, lon: -49.9501 },
  'presidente prudente|SP': { lat: -22.1207, lon: -51.3882 },
  'aracatuba|SP': { lat: -21.2076, lon: -50.4401 },
  'piracicaba|SP': { lat: -22.7338, lon: -47.6476 },
  'limeira|SP': { lat: -22.5641, lon: -47.4017 },
  'araraquara|SP': { lat: -21.7845, lon: -48.178 },
  'sao carlos|SP': { lat: -22.0174, lon: -47.8908 },
  'sao jose dos campos|SP': { lat: -23.1896, lon: -45.8841 },
  'taubate|SP': { lat: -23.0204, lon: -45.5562 },
  'santos|SP': { lat: -23.9608, lon: -46.3336 },
  'santo andre|SP': { lat: -23.6742, lon: -46.5436 },
  'sao bernardo do campo|SP': { lat: -23.6914, lon: -46.5646 },
  'osasco|SP': { lat: -23.5324, lon: -46.7917 },
  // Rio de Janeiro
  'rio de janeiro|RJ': { lat: -22.9068, lon: -43.1729 },
  'niteroi|RJ': { lat: -22.8832, lon: -43.1034 },
  'sao goncalo|RJ': { lat: -22.8268, lon: -43.0634 },
  'duque de caxias|RJ': { lat: -22.7858, lon: -43.3049 },
  'nova iguacu|RJ': { lat: -22.7556, lon: -43.4603 },
  'petropolis|RJ': { lat: -22.5112, lon: -43.1779 },
  'teresopolis|RJ': { lat: -22.4165, lon: -42.9752 },
  'nova friburgo|RJ': { lat: -22.2819, lon: -42.5311 },
  'volta redonda|RJ': { lat: -22.5202, lon: -44.0996 },
  'barra mansa|RJ': { lat: -22.5442, lon: -44.1714 },
  'resende|RJ': { lat: -22.4705, lon: -44.4509 },
  'campos dos goytacazes|RJ': { lat: -21.7622, lon: -41.3181 },
  'macae|RJ': { lat: -22.3768, lon: -41.7848 },
  'cabo frio|RJ': { lat: -22.8794, lon: -42.0187 },
  // Espírito Santo
  'vitoria|ES': { lat: -20.3155, lon: -40.3128 },
  'vila velha|ES': { lat: -20.3297, lon: -40.2925 },
  'serra|ES': { lat: -20.121, lon: -40.3074 },
  'cariacica|ES': { lat: -20.2639, lon: -40.42 },
  'cachoeiro de itapemirim|ES': { lat: -20.8489, lon: -41.1128 },
  'linhares|ES': { lat: -19.3947, lon: -40.0642 },
  'colatina|ES': { lat: -19.5394, lon: -40.6306 },
  // Goiás & DF
  'goiania|GO': { lat: -16.6869, lon: -49.2648 },
  'aparecida de goiania|GO': { lat: -16.8198, lon: -49.2469 },
  'anapolis|GO': { lat: -16.3281, lon: -48.953 },
  'rio verde|GO': { lat: -17.7923, lon: -50.9192 },
  'itumbiara|GO': { lat: -18.4192, lon: -49.2153 },
  'catalao|GO': { lat: -18.1658, lon: -47.9464 },
  'caldas novas|GO': { lat: -17.7441, lon: -48.6258 },
  'brasilia|DF': { lat: -15.7975, lon: -47.8919 },
  // Demais capitais / polos
  'salvador|BA': { lat: -12.9777, lon: -38.5016 },
  'feira de santana|BA': { lat: -12.2664, lon: -38.9663 },
  'vitoria da conquista|BA': { lat: -14.8619, lon: -40.8444 },
  'barreiras|BA': { lat: -12.1528, lon: -44.99 },
  'curitiba|PR': { lat: -25.4284, lon: -49.2733 },
  'londrina|PR': { lat: -23.3045, lon: -51.1696 },
  'maringa|PR': { lat: -23.421, lon: -51.9331 },
  'florianopolis|SC': { lat: -27.5954, lon: -48.548 },
  'joinville|SC': { lat: -26.3045, lon: -48.8487 },
  'blumenau|SC': { lat: -26.9194, lon: -49.0661 },
  'porto alegre|RS': { lat: -30.0346, lon: -51.2177 },
  'caxias do sul|RS': { lat: -29.1681, lon: -51.1794 },
  'campo grande|MS': { lat: -20.4697, lon: -54.6201 },
  'cuiaba|MT': { lat: -15.6014, lon: -56.0979 },
  'recife|PE': { lat: -8.0476, lon: -34.877 },
  'fortaleza|CE': { lat: -3.7319, lon: -38.5267 },
  'belem|PA': { lat: -1.4558, lon: -48.4902 },
  'manaus|AM': { lat: -3.119, lon: -60.0217 },
}

export function construirMapaCidadesConhecidas(): Map<string, CoordenadaGeo> {
  const map = new Map<string, CoordenadaGeo>()
  for (const [k, coord] of Object.entries(CIDADES_BASE)) {
    map.set(k, coord)
    const soCidade = k.split('|')[0]
    if (!map.has(soCidade)) map.set(soCidade, coord)
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, CoordenadaGeo>
        for (const [k, coord] of Object.entries(parsed)) {
          if (coord && Number.isFinite(coord.lat) && Number.isFinite(coord.lon)) {
            map.set(k, coord)
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return map
}

export function salvarCoordenadaCidadeCache(cidade: string, uf: string | undefined, coord: CoordenadaGeo): void {
  const cidNorm = normalizarTextoCidade(cidade)
  if (!cidNorm) return
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(CACHE_KEY)
    const obj: Record<string, CoordenadaGeo> = raw ? JSON.parse(raw) : {}
    if (uf) obj[`${cidNorm}|${uf.trim().toUpperCase()}`] = coord
    obj[cidNorm] = coord
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj))
  } catch {
    // ignore
  }
}

export async function geocodificarTextoGoogleOuBackend(
  texto: string,
  geocodeBackendFn?: (endereco: string) => Promise<CoordenadaGeo | null>,
): Promise<CoordenadaGeo | null> {
  const w = typeof window !== 'undefined' ? (window as any) : null
  if (w?.google?.maps?.Geocoder) {
    try {
      const geocoder = new w.google.maps.Geocoder()
      const loc = await new Promise<CoordenadaGeo | null>((resolve) => {
        geocoder.geocode({ address: `${texto}, Brasil` }, (results: any, status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const l = results[0].geometry.location
            resolve({ lat: l.lat(), lon: l.lng() })
          } else {
            resolve(null)
          }
        })
      })
      if (loc) return loc
    } catch {
      // fallback
    }
  }
  if (geocodeBackendFn) {
    return geocodeBackendFn(texto)
  }
  return null
}
