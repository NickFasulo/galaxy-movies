// Publishes a generated MP4 as a public Instagram Reel — there is no draft
// mode in the Graph API, so unlike TikTok/YouTube this posts live. IG fetches
// the video from a public URL: the MP4 is staged on a public Upstash Blob
// bucket, the container polls until the transcode finishes, then publishes
// and the staging object is deleted.
//
// Usage: node scripts/ig-upload.js <file.mp4> [more.mp4...]
// Env (process env or .env.local): UPSTASH_BLOB_TOKEN (public bucket —
//   create one in the Upstash console), IG_ACCESS_TOKEN + IG_USER_ID from
//   scripts/ig-auth.js. A sibling {name}.txt supplies the caption.
const fs = require('fs')
const path = require('path')
const { Bucket } = require('@upstash/blob')

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
const BLOB_TOKEN = envVar('UPSTASH_BLOB_TOKEN')
const ACCESS_TOKEN = envVar('IG_ACCESS_TOKEN')
const IG_USER = envVar('IG_USER_ID')
const GRAPH = 'https://graph.facebook.com/v21.0'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) { console.error('Usage: node scripts/ig-upload.js <file.mp4> [...]'); process.exit(1) }
for (const f of files) if (!fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1) }
if (!BLOB_TOKEN || !ACCESS_TOKEN || !IG_USER) {
  console.error('Need UPSTASH_BLOB_TOKEN + IG_ACCESS_TOKEN + IG_USER_ID')
  process.exit(1)
}

const bucket = new Bucket({ token: BLOB_TOKEN })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const graphPost = async (endpoint, params) => {
  const r = await fetch(`${GRAPH}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, access_token: ACCESS_TOKEN })
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${endpoint} failed: ${r.status} ${j.error?.message || ''}`)
  return j
}

const graphGet = async (endpoint, params) => {
  const q = new URLSearchParams({ ...params, access_token: ACCESS_TOKEN })
  const r = await fetch(`${GRAPH}/${endpoint}?${q}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${endpoint} failed: ${r.status} ${j.error?.message || ''}`)
  return j
}

async function publishReel(file) {
  const key = `ig-staging/${Date.now()}-${path.basename(file)}`
  const blob = await bucket.put(key, fs.readFileSync(file), { contentType: 'video/mp4' })
  if (!blob.url) throw new Error('blob bucket is private — create a public bucket for IG staging')
  try {
    const sidecar = file.replace(/\.mp4$/i, '.txt')
    const caption = fs.existsSync(sidecar)
      ? fs.readFileSync(sidecar, 'utf8').trim()
      : path.basename(file)
    const container = await graphPost(`${IG_USER}/media`, {
      media_type: 'REELS',
      video_url: blob.url,
      caption: `${caption}\n\ngalaxymovies.app`,
      share_to_feed: 'true'
    })

    // IG transcodes async — poll until FINISHED (ERROR/EXPIRED means the
    // video was rejected; status detail is on the same field).
    let status = ''
    for (let i = 0; i < 60 && status !== 'FINISHED'; i++) {
      await sleep(5000)
      status = (await graphGet(container.id, { fields: 'status_code' })).status_code || ''
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`container ${status}`)
    }
    if (status !== 'FINISHED') throw new Error('container never reached FINISHED')

    const published = await graphPost(`${IG_USER}/media_publish`, { creation_id: container.id })
    console.log(`published ${file} -> ig media id ${published.id}`)
  } finally {
    await bucket.del(key).catch((e) => console.error(`staging cleanup failed for ${key}: ${e.message || e}`))
  }
}

async function main() {
  for (const file of files) await publishReel(file)
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
