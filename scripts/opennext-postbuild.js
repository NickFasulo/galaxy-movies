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
  '0 7 * * *': '/api/cron/watchlist-alerts',
  '0 16 * * 5': '/api/cron/weekly-digest',
  '30 15 * * 1': '/api/cron/social-broadcast'
}

export default {
  ...worker,
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
