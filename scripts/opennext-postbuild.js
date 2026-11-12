/**
 * Post-build fixups for `opennextjs-cloudflare build` output (.open-next).
 *
 * 1. Drops stub modules where esbuild/wrangler still tries to resolve dead
 *    dev-only `require()` calls inside Next's own dist files — the adapter
 *    marks them `external` (see patches/@opennextjs+cloudflare+*.patch), and
 *    these stubs satisfy the runtime resolution without pulling Next's entire
 *    dev toolchain into the worker bundle.
 * 2. Copies public/ assets that API routes read from the vfs — workerd's cwd
 *    is /bundle (the .open-next root), so public/fonts + backdrop_fallback
 *    must sit at .open-next/public/* (declared as Data rules in wrangler.jsonc).
 * 3. Writes .open-next/entry.js: the generated worker.js wrapped with a
 *    `scheduled` handler reproducing the vercel.json cron jobs via the
 *    WORKER_SELF_REFERENCE service binding (same Bearer CRON_SECRET auth).
 */
const fs = require('fs')
const path = require('path')

const OPEN_NEXT = path.join(__dirname, '..', '.open-next')
const FN = path.join(OPEN_NEXT, 'server-functions', 'default')

const CJS_STUBS = [
  path.join(FN, 'dev', 'next-dev-server.js'),
  path.join(FN, 'router-utils', 'setup-dev-bundler.js'),
  path.join(OPEN_NEXT, 'lib', 'upgrade', 'nudge.js')
]
const ESM_STUBS = [path.join(FN, 'node_modules', 'react-server-dom-webpack', 'client.edge.js')]

for (const [file, code] of [
  ...CJS_STUBS.map((f) => [f, 'module.exports = {}\n']),
  ...ESM_STUBS.map((f) => [f, 'export default {}\n'])
]) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, code)
}

const fontsOut = path.join(OPEN_NEXT, 'public', 'fonts')
fs.mkdirSync(fontsOut, { recursive: true })
for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'fonts'))) {
  fs.copyFileSync(path.join(__dirname, '..', 'public', 'fonts', f), path.join(fontsOut, f))
}
fs.copyFileSync(
  path.join(__dirname, '..', 'public', 'backdrop_fallback.jpg'),
  path.join(OPEN_NEXT, 'public', 'backdrop_fallback.jpg')
)

fs.writeFileSync(
  path.join(OPEN_NEXT, 'entry.js'),
  `import worker from './worker.js'

// vercel.json cron parity — wrangler triggers fire scheduled() with the
// expression in event.cron; each hits the same endpoint Vercel would have.
const CRON_ROUTES = {
  '0 6 * * *': '/api/cron/generate-content',
  '30 6 * * *': '/api/cron/streaming-changes',
  '45 6 * * *': '/api/cron/digital-releases',
  '30 13 * * 3': '/api/cron/charts',
  '0 7 * * *': '/api/cron/watchlist-alerts',
  '0 16 * * 5': '/api/cron/weekly-digest',
  '30 15 * * 1': '/api/cron/social-broadcast',
  '0 17 25 * *': '/api/cron/social-monthly',
  '0 14 * * *': '/api/cron/social-lastchance',
  '0 14 * * 1': '/api/cron/indexing-report',
  '0 15 * * 3': '/api/cron/price-drops',
  '0 17 * * 4': '/api/cron/social-engagement',
  '0 18 * * 5': '/api/cron/social-reddit-engage'
}

// s-maxage on a Worker response does NOT reach Cloudflare's edge cache, so
// cacheable GETs go through the Cache API here. Handlers opt in with the
// Cache-Control they already emit: only 200s carrying s-maxage (and no
// private/no-store/set-cookie) are stored — bot thin renders and AI-
// incomplete pages emit private/no-store and stay out. Cookie/Authorization
// requests bypass entirely: nothing personalizes by header today, but that
// keeps any future header-varying response out of the shared pool. The
// country is in the key because GSSP varies on cf-ipcountry (detectRegion).
// BUILD_STAMP isolates each deploy — stale HTML can't serve dead chunk hashes.
const BUILD_STAMP = ${Date.now()}
const TRACKING_PARAM = /^(?:utm_|_ga$|_gl$|fbclid$|gclid$|dclid$|gbraid$|wbraid$|mc_cid$|mc_eid$|igshid$|ref_src$|spm$|scm$)/
const STATIC_FILE = /\\.(?:ico|png|jpe?g|webp|avif|svg|gif|woff2?|ttf|otf|css|js|map|json|txt|webmanifest|mp4|webm|mov|pdf)$/
const SKIP_PREFIXES = ['/_next/', '/api/cron/', '/api/og']

function edgeKey(request) {
  const url = new URL(request.url)
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const qs = new URLSearchParams(params).toString()
  return url.origin + url.pathname + '?__r=' + (request.cf?.country || 'XX') + '&__b=' + BUILD_STAMP + (qs ? '&' + qs : '')
}

async function fetch(request, env, ctx) {
  const url = new URL(request.url)
  const cacheable =
    request.method === 'GET' &&
    !request.headers.get('cookie') &&
    !request.headers.get('authorization') &&
    !request.headers.get('range') &&
    !SKIP_PREFIXES.some((p) => url.pathname.startsWith(p)) &&
    !STATIC_FILE.test(url.pathname)
  if (!cacheable) return worker.fetch(request, env, ctx)

  const key = edgeKey(request)
  const hit = await caches.default.match(key)
  if (hit) {
    const cached = new Response(hit.body, hit)
    cached.headers.set('x-edge-cache', 'hit')
    return cached
  }

  const res = await worker.fetch(request, env, ctx)
  const cc = res.headers.get('cache-control') || ''
  const ttl = Number(/s-maxage=(\\d+)/.exec(cc)?.[1] || 0)
  if (res.status === 200 && ttl > 0 && !/(?:private|no-store)/.test(cc) && !res.headers.has('set-cookie')) {
    const stored = new Response(res.clone().body, res)
    stored.headers.set('cache-control', 'public, max-age=' + ttl)
    ctx.waitUntil(caches.default.put(key, stored))
  }
  const out = new Response(res.body, res)
  out.headers.set('x-edge-cache', 'miss')
  return out
}

export default {
  ...worker,
  fetch,
  async scheduled(event, env, ctx) {
    const route = CRON_ROUTES[event.cron]
    console.log('[cron]', JSON.stringify(event.cron), '→', route || 'no match')
    if (!route) return
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch(
        new Request('https://worker.internal' + route, {
          headers: { authorization: 'Bearer ' + env.CRON_SECRET }
        })
      ).then((r) => console.log('[cron]', route, r.status))
    )
  }
}
`
)

console.log('opennext-postbuild: stubs, fonts, entry.js written')
