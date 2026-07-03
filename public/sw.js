/* SailClubHQ service worker — offline-first PWA shell + map tile cache.
 *
 * Goals for sailors at sea:
 *  - App shell + navigation work offline (so the tracker / race nav open with no signal).
 *  - Map tiles seen while ashore are cached, so the map still draws offline for that area.
 *
 * We deliberately keep this hand-written (no next-pwa) to stay in full control and
 * avoid build-tool coupling. Bump SW_VERSION to invalidate old caches on deploy.
 */

const SW_VERSION = 'v1'
const SHELL_CACHE = `scq-shell-${SW_VERSION}`
const TILE_CACHE = `scq-tiles-${SW_VERSION}`
const RUNTIME_CACHE = `scq-runtime-${SW_VERSION}`

// Core routes/assets to pre-cache so the app opens offline.
const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Map tile hosts (OpenStreetMap base + OpenSeaMap seamarks).
const TILE_HOSTS = ['tile.openstreetmap.org', 'tiles.openseamap.org']

// Cap the tile cache so a big offline area doesn't grow unbounded.
const TILE_CACHE_LIMIT = 1500

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.endsWith(SW_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= limit) return
  // Delete oldest entries (FIFO).
  const excess = keys.length - limit
  for (let i = 0; i < excess; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // ── Map tiles: cache-first (so previously-seen areas render offline) ──────────
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const resp = await fetch(request)
          if (resp && resp.status === 200) {
            cache.put(request, resp.clone())
            void trimCache(TILE_CACHE, TILE_CACHE_LIMIT)
          }
          return resp
        } catch {
          // Offline and not cached — return a transparent 1x1 so the map degrades gracefully.
          return cached || Response.error()
        }
      }),
    )
    return
  }

  // ── App navigations: network-first, fall back to cache (offline shell) ────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone()
          void caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy))
          return resp
        })
        .catch(async () => {
          const cached = await caches.match(request)
          return (
            cached ||
            (await caches.match('/dashboard')) ||
            (await caches.match('/')) ||
            Response.error()
          )
        }),
    )
    return
  }

  // ── Static assets (JS/CSS/img): stale-while-revalidate ────────────────────────
  if (
    url.origin === self.location.origin &&
    /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((resp) => {
            if (resp && resp.status === 200) cache.put(request, resp.clone())
            return resp
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
})
