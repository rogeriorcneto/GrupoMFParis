import type { Cliente } from '../types'

export type RedesSociaisMap = Record<string, string>

export interface SocialLinkItem {
  key: string
  icon: string
  url: string
  title: string
}

const VALID_KEYS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'twitter', 'website'] as const

function limparToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^["'{[\s]+/, '')
    .replace(/["'}\],\s;]+$/, '')
    .replace(/\\"/g, '')
    .trim()
}

function normalizarUrlSocial(tipo: string, valorBruto: string): string | null {
  const limpo = limparToken(valorBruto)
    .replace(/^(instagram|insta|ig|facebook|fb|linkedin|tiktok|youtube|twitter|site|website)\s*:\s*/i, '')
    .trim()
  if (!limpo) return null
  if (/^(instagram|insta|facebook|fb|linkedin|tiktok|youtube|twitter|site|website):?$/i.test(limpo)) return null

  if (/^https?:\/\//i.test(limpo)) {
    try {
      const u = new URL(limpo)
      const host = u.hostname.toLowerCase()
      // Rejeita hostnames inválidos como "com.br", "com", ou com caracteres JSON
      if (!host.includes('.') || /^(www\.)?(com|com\.br|net|org|br)$/.test(host) || /["'{}[\]]/.test(host)) {
        return null
      }
      if (tipo !== 'website') {
        const pathClean = u.pathname.replace(/^\/+|\/+$/g, '')
        if (!pathClean || /^(instagram|facebook|linkedin):?$/i.test(pathClean)) return null
      }
      return u.toString()
    } catch {
      return null
    }
  }

  // Sem http(s): tratar @handle ou domínio válido
  if (tipo === 'instagram') {
    const h = limpo.replace(/^@/, '').replace(/^.*instagram\.com\/?/i, '').replace(/\/+$/, '')
    if (!h || /[:\s"{}[\]]/.test(h) || /^instagram$/i.test(h)) return null
    return `https://instagram.com/${h}`
  }
  if (tipo === 'facebook') {
    const h = limpo.replace(/^@/, '').replace(/^.*(facebook|fb)\.com\/?/i, '').replace(/\/+$/, '')
    if (!h || /[:\s"{}[\]]/.test(h)) return null
    return `https://facebook.com/${h}`
  }
  if (tipo === 'linkedin') {
    const h = limpo.replace(/^.*linkedin\.com\/(in|company)\/?/i, '').replace(/^.*linkedin\.com\/?/i, '').replace(/\/+$/, '')
    if (!h || /[:\s"{}[\]]/.test(h)) return null
    return `https://linkedin.com/company/${h}`
  }
  if (tipo === 'tiktok') {
    const h = limpo.replace(/^@/, '').replace(/^.*tiktok\.com\/@?/i, '').replace(/\/+$/, '')
    if (!h || /[:\s"{}[\]]/.test(h)) return null
    return `https://tiktok.com/@${h}`
  }
  if (tipo === 'youtube') {
    const h = limpo.replace(/^.*(youtube\.com|youtu\.be)\/?/i, '').replace(/\/+$/, '')
    if (!h || /[:\s"{}[\]]/.test(h)) return null
    return `https://youtube.com/${h}`
  }
  if (tipo === 'twitter') {
    const h = limpo.replace(/^@/, '').replace(/^.*(twitter|x)\.com\/?/i, '').replace(/\/+$/, '')
    if (!h || /[:\s"{}[\]]/.test(h)) return null
    return `https://x.com/${h}`
  }
  if (tipo === 'website') {
    const hostCandidate = limpo.split('/')[0].toLowerCase()
    if (
      !hostCandidate.includes('.') ||
      /^(www\.)?(com|com\.br|net|org|br)$/.test(hostCandidate) ||
      /[:\s"{}[\]]/.test(limpo)
    ) {
      return null
    }
    return `https://${limpo}`
  }
  return null
}

function detectarTipoPorTexto(entry: string): string {
  const e = entry.trim().toLowerCase()
  if (e.startsWith('@') || e.includes('instagram') || e.includes('insta')) return 'instagram'
  if (e.includes('facebook') || e.includes('fb.com')) return 'facebook'
  if (e.includes('linkedin')) return 'linkedin'
  if (e.includes('tiktok')) return 'tiktok'
  if (e.includes('youtube') || e.includes('youtu.be')) return 'youtube'
  if (e.includes('twitter') || e.includes('x.com')) return 'twitter'
  return 'website'
}

export function parseRedesSociaisMap(
  raw: unknown,
  extras?: Partial<Pick<Cliente, 'instagram' | 'facebook' | 'linkedin' | 'website'>>
): RedesSociaisMap {
  const out: RedesSociaisMap = {}

  const add = (key: string, val: unknown) => {
    if (typeof val !== 'string' || !val.trim()) return
    const k = VALID_KEYS.includes(key as any) ? key : detectarTipoPorTexto(val)
    const url = normalizarUrlSocial(k, val)
    if (url && !out[k]) out[k] = url
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) add(k.toLowerCase(), v)
  } else if (Array.isArray(raw)) {
    for (const item of raw) add(detectarTipoPorTexto(String(item)), item)
  } else if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim()
    let parsedJson = false
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const p = JSON.parse(trimmed)
        parsedJson = true
        if (Array.isArray(p)) {
          for (const item of p) add(detectarTipoPorTexto(String(item)), item)
        } else if (p && typeof p === 'object') {
          for (const [k, v] of Object.entries(p)) add(k.toLowerCase(), v)
        }
      } catch {
        // Se for JSON malformado, extrai apenas URLs http(s) válidas por regex
        const urls = trimmed.match(/https?:\/\/[^\s"'{}[\],;|]+/gi) || []
        for (const u of urls) add(detectarTipoPorTexto(u), u)
        parsedJson = true
      }
    }
    if (!parsedJson) {
      // Formato rotulado: "Instagram: https://... | Facebook: https://..." ou separado por | ; , \n
      const partes = trimmed.split(/\s*[|;\n]+\s*|\s*,\s*(?=(?:https?:|@|(?:instagram|facebook|linkedin|tiktok|youtube|twitter|site|website)\s*:))/i)
      for (const parte of partes) {
        const mLabel = parte.match(/^\s*(instagram|insta|ig|facebook|fb|linkedin|tiktok|youtube|twitter|site|website)\s*:\s*(.+)$/i)
        if (mLabel) {
          const kMap: Record<string, string> = { insta: 'instagram', ig: 'instagram', fb: 'facebook', site: 'website' }
          const rawKey = mLabel[1].toLowerCase()
          add(kMap[rawKey] || rawKey, mLabel[2])
        } else {
          const urls = parte.match(/https?:\/\/[^\s"'{}[\],;|]+/gi)
          if (urls && urls.length > 0) {
            for (const u of urls) add(detectarTipoPorTexto(u), u)
          } else {
            add(detectarTipoPorTexto(parte), parte)
          }
        }
      }
    }
  }

  if (extras?.instagram) add('instagram', extras.instagram)
  if (extras?.facebook) add('facebook', extras.facebook)
  if (extras?.linkedin) add('linkedin', extras.linkedin)
  if (extras?.website) add('website', extras.website)

  return out
}

const META_ICONS: Record<string, { icon: string; title: string }> = {
  instagram: { icon: '📸', title: 'Instagram' },
  facebook: { icon: '👤', title: 'Facebook' },
  linkedin: { icon: '💼', title: 'LinkedIn' },
  tiktok: { icon: '🎵', title: 'TikTok' },
  youtube: { icon: '▶️', title: 'YouTube' },
  twitter: { icon: '🐦', title: 'X / Twitter' },
  website: { icon: '🌐', title: 'Site' },
}

export function extractValidSocialLinks(
  cliente: Pick<Cliente, 'redesSociais' | 'instagram' | 'facebook' | 'linkedin' | 'website'>
): SocialLinkItem[] {
  const map = parseRedesSociaisMap(cliente.redesSociais, cliente)
  const seen = new Set<string>()
  const result: SocialLinkItem[] = []
  for (const key of VALID_KEYS) {
    const url = map[key]
    if (!url) continue
    const norm = url.toLowerCase().replace(/\/+$/, '')
    if (seen.has(norm)) continue
    seen.add(norm)
    const meta = META_ICONS[key] || META_ICONS.website
    result.push({ key, icon: meta.icon, url, title: meta.title })
  }
  return result
}
