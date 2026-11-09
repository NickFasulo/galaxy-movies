// Uploads a generated MP4 to YouTube as a PRIVATE video — the manual-finish
// counterpart to tiktok-upload.js's draft mode. Apps that haven't passed a
// YouTube API audit can't publish public videos anyway, so the video lands
// private and gets flipped public from YouTube Studio (web or app), exactly
// like the TikTok inbox draft flow. Vertical + <3min is all a Short needs.
//
// Usage: node scripts/youtube-upload.js <file.mp4> [more.mp4...]
// Env (process env or .env.local): YT_REFRESH_TOKEN plus client creds —
//   YT_CLIENT_ID/YT_CLIENT_SECRET, falling back to GOOGLE_OAUTH_CLIENT_ID/
//   GOOGLE_OAUTH_CLIENT_SECRET. A sibling {name}.txt caption feeds the
//   title (first line, <=100 chars) and description (the rest).
//   Optional: YT_CHANNEL_ID — aborts before any upload if the refresh token
//   resolves to a different channel (tokens are bound to the channel picked
//   at OAuth consent and can't be repointed). YT_PRIVACY overrides the
//   privacy status (private|unlisted|public) — 'public' only sticks once the
//   GCP project passes YouTube's API audit; until then YT forces private.
const fs = require('fs')
const path = require('path')

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
const CLIENT_ID = envVar('YT_CLIENT_ID') || envVar('GOOGLE_OAUTH_CLIENT_ID')
const CLIENT_SECRET = envVar('YT_CLIENT_SECRET') || envVar('GOOGLE_OAUTH_CLIENT_SECRET')
const REFRESH_TOKEN = envVar('YT_REFRESH_TOKEN')
const EXPECT_CHANNEL = envVar('YT_CHANNEL_ID')
const PRIVACY = ['private', 'unlisted', 'public'].includes(envVar('YT_PRIVACY')) ? envVar('YT_PRIVACY') : 'private'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) { console.error('Usage: node scripts/youtube-upload.js <file.mp4> [...]'); process.exit(1) }
for (const f of files) if (!fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1) }
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Need YT_REFRESH_TOKEN + client creds (YT_CLIENT_ID/SECRET or GOOGLE_OAUTH_*)')
  process.exit(1)
}

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN
    })
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`token refresh failed: ${j.error_description || j.error || r.status}`)
  return j.access_token
}

async function upload(token, file) {
  const bytes = fs.readFileSync(file)
  const sidecar = file.replace(/\.mp4$/i, '.txt')
  const caption = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8').trim() : path.basename(file)
  const lines = caption.split('\n')
  const title = (lines[0] || path.basename(file)).slice(0, 100)
  const description = `${lines.slice(1).join('\n').trim()}\n\nhttps://www.galaxymovies.app`.trim()

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(bytes.length)
    },
    body: JSON.stringify({
      snippet: { title, description, categoryId: '24' },
      status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false }
    })
  })
  if (!init.ok) throw new Error(`init failed for ${file}: ${init.status} ${await init.text()}`)
  const uploadUrl = init.headers.get('location')
  if (!uploadUrl) throw new Error(`init returned no upload URL for ${file}`)

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: bytes
  })
  const j = await put.json().catch(() => ({}))
  if (!put.ok) throw new Error(`upload failed for ${file}: ${put.status} ${j.error?.message || ''}`)
  return j.id
}

// mine=true resolves the channel the refresh token was issued to — one
// quota unit per run in exchange for never posting to the wrong account.
async function channelInfo(token) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`channel check failed: ${j.error?.message || r.status}`)
  const ch = j.items?.[0]
  if (!ch) throw new Error('channel check failed: token has no channel')
  return { id: ch.id, title: ch.snippet?.title || ch.id }
}

async function main() {
  const token = await accessToken()
  const channel = await channelInfo(token)
  if (EXPECT_CHANNEL && channel.id !== EXPECT_CHANNEL) {
    throw new Error(`token is bound to ${channel.title} (${channel.id}) — expected ${EXPECT_CHANNEL}`)
  }
  console.log(`channel: ${channel.title} (${channel.id})`)
  for (const file of files) {
    const id = await upload(token, file)
    console.log(`uploaded ${file} -> https://studio.youtube.com/video/${id}/edit (${PRIVACY})`)
  }
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
