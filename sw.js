/* ================================================================
   GARASI PRO — Service Worker v4
   Fixes:
   • Bug #1: catch() block now returns proper Response (not undefined)
   • Bug #2: skipWaiting() moved inside event.waitUntil() so SW
             only activates AFTER cache is fully populated
   • Bug #3: chrome-extension:// and non-http URLs are skipped
   • Bug #4: Live Server hot-reload endpoints are not cached
================================================================ */

const CACHE_NAME   = 'garasi-pro-v4';
const SKIP_ORIGINS = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];

// Core static assets to pre-cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
];

// CDN assets cached separately (failures won't break install)
const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-brands-400.woff2',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,300;0,400;0,600;0,700;0,800;0,900;1,700&family=Share+Tech+Mono&family=Barlow+Condensed:wght@300;400;600;700&display=swap',
];

/* ──────────────────────────────────────────────────────────────
   INSTALL
   Pre-cache static shell first, then try CDN (best-effort)
────────────────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            // 1. Core assets — must succeed
            await cache.addAll(STATIC_ASSETS);
            console.log('[SW] Core assets cached.');

            // 2. CDN assets — best-effort (failure ok)
            const cdnResults = await Promise.allSettled(
                CDN_ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] CDN cache skip:', url, e)))
            );
            const ok = cdnResults.filter(r => r.status === 'fulfilled').length;
            console.log(`[SW] CDN caching: ${ok}/${CDN_ASSETS.length} ok.`);

            // Only skip waiting after cache is ready
            await self.skipWaiting();
        })()
    );
});

/* ──────────────────────────────────────────────────────────────
   ACTIVATE
   Delete old caches, claim clients immediately
────────────────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
            )
        ).then(() => self.clients.claim())
    );
});

/* ──────────────────────────────────────────────────────────────
   FETCH  (Cache-First with Network Fallback)
   Fix: catch() returns a proper Response, never undefined
────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Skip non-http protocols (extensions, blobs, etc.)
    if (SKIP_ORIGINS.some(o => request.url.startsWith(o))) return;
    if (!request.url.startsWith('http')) return;

    // Skip Live Server hot-reload & WebSocket upgrade requests
    if (request.url.includes('__livereload') || request.url.includes('/livereload')) return;
    if (request.headers.get('upgrade') === 'websocket') return;

    // Skip Anthropic / AI API calls — never cache these
    if (request.url.includes('anthropic.com')) return;

    event.respondWith(
        caches.match(request).then(async (cached) => {

            // ── 1. Serve from cache if available ──
            if (cached) {
                // Background revalidate for HTML pages (stale-while-revalidate)
                if (request.destination === 'document') {
                    fetch(request)
                        .then(async fresh => {
                            if (fresh && fresh.status === 200) {
                                const c = await caches.open(CACHE_NAME);
                                c.put(request, fresh);
                            }
                        })
                        .catch(() => {});
                }
                return cached;
            }

            // ── 2. Fetch from network ──
            try {
                const response = await fetch(request);

                // Only cache valid, non-opaque responses from http/https
                const shouldCache =
                    response &&
                    response.status === 200 &&
                    (response.type === 'basic' || response.type === 'cors') &&
                    request.url.startsWith('http');

                if (shouldCache) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                }

                return response;

            } catch (networkError) {
                // ── 3. OFFLINE FALLBACK ──
                // BUG FIX: always return a valid Response, never undefined
                console.warn('[SW] Offline, tidak ada cache untuk:', request.url);

                if (request.destination === 'document') {
                    // Try to serve the cached shell
                    const shell = await caches.match('./index.html');
                    if (shell) return shell;
                }

                // Generic offline response for everything else
                return new Response(
                    JSON.stringify({ error: 'offline', url: request.url }),
                    {
                        status:  503,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }
        })
    );
});