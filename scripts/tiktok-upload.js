// Sends a generated MP4 to the user's TikTok drafts via the Content Posting
// API (video.upload scope) — the video lands in the TikTok inbox and the user
// taps the notification to finish posting. Draft uploads are the
// semi-automated path: video.publish (fully hands-off public posts) requires
// an audited app or posts come out private-only.
//
// Usage: node scripts/tiktok-upload.js <file.mp4> [more.mp4...]
// Env (process env or .env.local): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
//   TIKTOK_REFRESH_TOKEN. Optional: TIKTOK_GH_TOKEN — a PAT with repo scope;
//   when present the rotated refresh token is written back to the
//   TIKTOK_REFRESH_TOKEN repo secret via `gh secret set`.
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
const CLIENT_KEY = envVar('TIKTOK_CLIENT_KEY')
const CLIENT_SECRET = envVar('TIKTOK_CLIENT_SECRET')
const REFRESH_TOKEN = envVar('TIKTOK_REFRESH_TOKEN')
const GH_TOKEN = envVar('TIKTOK_GH_TOKEN')

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) { console.error('Usage: node scripts/tiktok-upload.js <file.mp4> [...]'); process.exit(1) }
for (const f of files) if (!fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1) }
if (!CLIENT_KEY || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Need TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET + TIKTOK_REFRESH_TOKEN')
  process.exit(1)
}

const API = 'https://open.tiktokapis.com'

async function refreshAccessToken() {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
  })
  const r = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(`token refresh failed: ${j.error_description || j.error || r.status}`)
  if (j.refresh_token && j.refresh_token !== REFRESH_TOKEN) persistRotatedToken(j.refresh_token)
  return j.access_token
}

// TikTok rotates refresh tokens on use; the secret must follow or the next
// run re-auths from scratch. In CI a PAT lets us update the repo secret.
function persistRotatedToken(token) {
  if (!GH_TOKEN) {
    console.error(`Refresh token rotated and no TIKTOK_GH_TOKEN to persist it — update TIKTOK_REFRESH_TOKEN to:\n${token}`)
    return
  }
  const r = spawnSync('gh', ['secret', 'set', 'TIKTOK_REFRESH_TOKEN', '--body', token], {
    env: { ...process.env, GH_TOKEN },
    stdio: 'pipe',
  })
  console.log(r.status === 0 ? 'Rotated refresh token stored to repo secret' : `gh secret set failed: ${r.stderr?.toString().trim()}`)
}

async function initUpload(accessToken, size) {
  const r = await fetch(`${API}/v2/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
    }),
  })
  const j = await r.json()
  if (!r.ok || j.error?.code !== 'ok') throw new Error(`init failed: ${j.error?.message || r.status}`)
  return j.data
}

async function checkStatus(accessToken, publishId) {
  const r = await fetch(`${API}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId }),
  })
  const j = await r.json()
  return j.data?.status || j.error?.code || 'unknown'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const accessToken = await refreshAccessToken()
  for (const file of files) {
    const bytes = fs.readFileSync(file)
    const { publish_id, upload_url } = await initUpload(accessToken, bytes.length)
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` },
      body: bytes,
    })
    if (!put.ok) throw new Error(`upload failed for ${file}: ${put.status} ${await put.text()}`)
    console.log(`uploaded ${file} (publish_id ${publish_id})`)
    for (let i = 0; i < 3; i++) {
      await sleep(4000)
      const status = await checkStatus(accessToken, publish_id)
      console.log(`  status: ${status}`)
      if (status !== 'PROCESSING_DOWNLOAD' && status !== 'PROCESSING_UPLOAD') break
    }
    console.log('  -> check TikTok inbox notifications to post')
  }
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
