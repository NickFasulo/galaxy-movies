// Uploads generated MP4s to TikTok via the Content Posting API. Default mode
// drops them into the TikTok drafts inbox (video.upload scope) — the user
// taps a notification to finish posting. --post uses Direct Post
// (video.publish scope) for fully hands-off publishing; until the app passes
// TikTok's audit those posts are restricted to SELF_ONLY privacy.
//
// Usage: node scripts/tiktok-upload.js [--post] [--title T] [--privacy L] <file.mp4> [...]
// The post caption comes from a sibling .txt next to each mp4 (the generator
// writes one), then --title, then the filename.
// Env (process env or .env.local): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
//   TIKTOK_REFRESH_TOKEN. Optional: TIKTOK_PRIVACY — requested privacy level
//   (default PUBLIC_TO_EVERYONE; falls back to whatever the creator allows,
//   which is SELF_ONLY while the app is unaudited). Optional: TIKTOK_GH_TOKEN —
//   a PAT with repo scope; when present the rotated refresh token is written
//   back to the TIKTOK_REFRESH_TOKEN repo secret via `gh secret set`.
// --sandbox swaps to the TIKTOK_SANDBOX_* app creds + TIKTOK_SANDBOX_REFRESH_TOKEN
//   — required for the app-review demo video, which must run on the sandbox.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const env = {}
const envPath = path.join(ROOT, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const envVar = (name) => process.env[name] || env[name]
const SANDBOX = process.argv.includes('--sandbox')
const CLIENT_KEY = envVar(SANDBOX ? 'TIKTOK_SANDBOX_KEY' : 'TIKTOK_CLIENT_KEY')
const CLIENT_SECRET = envVar(SANDBOX ? 'TIKTOK_SANDBOX_SECRET' : 'TIKTOK_CLIENT_SECRET')
const REFRESH_TOKEN = envVar(SANDBOX ? 'TIKTOK_SANDBOX_REFRESH_TOKEN' : 'TIKTOK_REFRESH_TOKEN')
const SECRET_NAME = SANDBOX ? 'TIKTOK_SANDBOX_REFRESH_TOKEN' : 'TIKTOK_REFRESH_TOKEN'
const GH_TOKEN = envVar('TIKTOK_GH_TOKEN')

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const POST = process.argv.includes('--post')
const TITLE = arg('title')
const PRIVACY = (arg('privacy') || envVar('TIKTOK_PRIVACY') || 'PUBLIC_TO_EVERYONE').toUpperCase()
const files = process.argv.slice(2).filter((a, i, all) =>
  !a.startsWith('--') && all[i - 1] !== '--title' && all[i - 1] !== '--privacy')
if (!files.length) { console.error('Usage: node scripts/tiktok-upload.js [--post] [--title T] <file.mp4> [...]'); process.exit(1) }
for (const f of files) if (!fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1) }
if (!CLIENT_KEY || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Need TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET + TIKTOK_REFRESH_TOKEN')
  process.exit(1)
}

const API = 'https://open.tiktokapis.com'
const post = (accessToken, pathname, body) => fetch(`${API}${pathname}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
  body: JSON.stringify(body || {}),
}).then((r) => r.json())

const check = (j, what) => {
  if (j.error && j.error.code !== 'ok') throw new Error(`${what} failed: ${j.error.message || j.error.code}`)
  return j.data
}

async function refreshAccessToken() {
  const j = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  }).then((r) => r.json())
  if (j.error) throw new Error(`token refresh failed: ${j.error_description || j.error}`)
  if (j.refresh_token && j.refresh_token !== REFRESH_TOKEN) persistRotatedToken(j.refresh_token)
  return { accessToken: j.access_token, scope: String(j.scope || '') }
}

// TikTok rotates refresh tokens on use; the secret must follow or the next
// run re-auths from scratch. In CI a PAT lets us update the repo secret.
function persistRotatedToken(token) {
  if (!GH_TOKEN) {
    console.error(`Refresh token rotated and no TIKTOK_GH_TOKEN to persist it — update ${SECRET_NAME} to:\n${token}`)
    return
  }
  const r = spawnSync('gh', ['secret', 'set', SECRET_NAME, '--body', token], {
    env: { ...process.env, GH_TOKEN },
    stdio: 'pipe',
  })
  console.log(r.status === 0 ? 'Rotated refresh token stored to repo secret' : `gh secret set failed: ${r.stderr?.toString().trim()}`)
}

// Drafts inbox — video lands as a notification the user finishes in-app.
const initDraft = (accessToken, size) => post(accessToken, '/v2/post/publish/inbox/video/init/', {
  source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
}).then((j) => check(j, 'draft init'))

// Direct Post — publishes straight to the account. Cover at 1.5s: frame 0 is
// the still-fading intro (near-black), 1.5s is the fully-visible headline.
const initPost = (accessToken, title, privacy, size) => post(accessToken, '/v2/post/publish/video/init/', {
  post_info: {
    title,
    privacy_level: privacy,
    disable_duet: false,
    disable_comment: false,
    disable_stitch: false,
    video_cover_timestamp_ms: 1500,
  },
  source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
}).then((j) => check(j, 'post init'))

const fetchStatus = (accessToken, publishId) =>
  post(accessToken, '/v2/post/publish/status/fetch/', { publish_id: publishId })
    .then((j) => ({ status: j.data?.status || j.error?.code || 'unknown', reason: j.data?.fail_reason }))

const TERMINAL = new Set(['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED'])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitStatus(accessToken, publishId) {
  for (let i = 0; i < 15; i++) {
    await sleep(4000)
    const s = await fetchStatus(accessToken, publishId)
    console.log(`  status: ${s.status}${s.reason ? ` (${s.reason})` : ''}`)
    if (TERMINAL.has(s.status)) return s
  }
  return { status: 'TIMEOUT' }
}

// Sidecar caption written by generate-tiktok-video.js, else --title, else filename.
const captionFor = (file) => {
  const sidecar = file.replace(/\.mp4$/i, '.txt')
  if (fs.existsSync(sidecar)) return fs.readFileSync(sidecar, 'utf8').trim()
  return TITLE || path.basename(file).replace(/\.mp4$/i, '').replace(/-/g, ' ')
}

async function main() {
  const { accessToken, scope } = await refreshAccessToken()
  let privacy = PRIVACY
  if (POST) {
    if (!scope.split(/[,\s]+/).includes('video.publish')) {
      throw new Error('token lacks video.publish — enable the scope on the app and re-run scripts/tiktok-auth.js')
    }
    const info = check(await post(accessToken, '/v2/post/publish/creator_info/query/'), 'creator_info')
    const options = info.privacy_level_options || []
    if (!options.includes(privacy)) {
      console.log(`${privacy} not allowed (options: ${options.join(', ') || 'none'}) — app is likely unaudited; posting SELF_ONLY`)
      privacy = options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0]
    }
    if (!privacy) throw new Error('creator_info returned no privacy_level_options')
    console.log(`posting as @${info.creator_username || '?'} — privacy ${privacy}, max ${info.max_video_post_duration_sec}s`)
  }
  for (const file of files) {
    const bytes = fs.readFileSync(file)
    const init = POST ? await initPost(accessToken, captionFor(file), privacy, bytes.length)
      : await initDraft(accessToken, bytes.length)
    const put = await fetch(init.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` },
      body: bytes,
    })
    if (!put.ok) throw new Error(`upload failed for ${file}: ${put.status} ${await put.text()}`)
    console.log(`uploaded ${file} (publish_id ${init.publish_id})`)
    const s = await waitStatus(accessToken, init.publish_id)
    if (s.status === 'FAILED') throw new Error(`publish failed for ${file}: ${s.reason || 'unknown'}`)
    console.log(POST ? `  -> ${s.status}` : '  -> check TikTok inbox notifications to post')
  }
}

main().catch((err) => { console.error(err.message || err); process.exitCode = 1 })
