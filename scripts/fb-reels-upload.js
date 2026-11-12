// Publishes a generated MP4 as a Facebook Page Reel — like ig-upload.js the
// Graph API has no draft mode, so this posts live. FB Reels uses a 3-phase
// resumable upload (start -> binary PUT -> finish) so unlike IG there's no
// public-URL staging hop.
//
// Usage: node scripts/fb-reels-upload.js <file.mp4> [more.mp4...]
// Env (process env or .env.local): FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN — the
// same Page token the facebook text channel uses, minted by ig-auth.js; the
// token needs pages_manage_posts + pages_read_engagement. A sibling
// {name}.txt supplies the Reel description.
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
const PAGE_ID = envVar('FB_PAGE_ID')
const PAGE_TOKEN = envVar('FB_PAGE_ACCESS_TOKEN')
const GRAPH = 'https://graph.facebook.com/v21.0'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) { console.error('Usage: node scripts/fb-reels-upload.js <file.mp4> [...]'); process.exit(1) }
for (const f of files) if (!fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1) }
if (!PAGE_ID || !PAGE_TOKEN) {
  console.error('Need FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN')
  process.exit(1)
}

// Token rides in the form body, never the URL — same convention as the
// facebook broadcast channel so it can't land in access logs.
const graphPost = async (params) => {
  const r = await fetch(`${GRAPH}/${PAGE_ID}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, access_token: PAGE_TOKEN })
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${params.upload_phase} failed: ${r.status} ${j.error?.message || ''}`)
  return j
}

async function publishReel(file) {
  const bytes = fs.readFileSync(file)
  const sidecar = file.replace(/\.mp4$/i, '.txt')
  const caption = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8').trim() : path.basename(file)

  const start = await graphPost({ upload_phase: 'start' })
  if (!start.video_id || !start.upload_url) throw new Error('start phase returned no upload_url')

  const up = await fetch(start.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${PAGE_TOKEN}`,
      offset: '0',
      file_size: String(bytes.length),
      'Content-Type': 'application/octet-stream'
    },
    body: bytes
  })
  const upJson = await up.json().catch(() => ({}))
  if (!up.ok || upJson.success === false) {
    throw new Error(`upload failed: ${up.status} ${upJson.error?.message || ''}`)
  }

  const finish = await graphPost({
    upload_phase: 'finish',
    video_id: start.video_id,
    video_state: 'PUBLISHED',
    description: `${caption}\n\ngalaxymovies.app`
  })
  console.log(`published ${file} -> fb reel ${finish.post_id || start.video_id}`)
}

async function main() {
  for (const file of files) await publishReel(file)
}

main().catch((err) => { console.error(err.message || err); process.exit(1) })
