/* CRM MF Paris — service worker mínimo para PWA
   Estratégia: assets com hash → cache-first; navegação → network-first;
   chamadas de API/Supabase → sempre rede (nunca cachear dados dinâmicos). */

const ASSET_CACHE = 'crm-assets-v1'
const PAGE_CACHE = 'crm-pages-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== ASSET_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Nunca intercepta chamadas de API / externas
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return

  // Assets com hash do Vite → cache-first (imutáveis)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(ASSET_CACHE).then((c) => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Ícones/imagens públicas → cache-first
  if (url.pathname.startsWith('/icons/') || /\.(png|jpe?g|webp|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(ASSET_CACHE).then((c) => c.put(request, clone))
        }
        return res
      }))
    )
    return
  }

  // Navegação (SPA) → network-first, fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(PAGE_CACHE).then((c) => c.put('/', clone))
        }
        return res
      }).catch(() => caches.match('/') || caches.match('/index.html'))
    )
    return
  }
})
