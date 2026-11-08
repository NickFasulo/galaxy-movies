// Emails each generated MP4 (with its .txt caption in the body) so the video
// can be posted manually from the TikTok app while the developer app awaits
// review. Attach -> paste caption -> post. Runs in tiktok.yml daily.
// Usage: node scripts/tiktok-send.js <file.mp4> [...]
// Env (process env or .env.local): RESEND_API_KEY, TIKTOK_EMAIL_TO.
// Optional: RESEND_FROM (defaults to the alerts sender).
const fs = require('fs')
const path = require('path')

const env = {}
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const envVar = (name) => process.env[name] || env[name]
const API_KEY = envVar('RESEND_API_KEY')
const FROM = envVar('RESEND_FROM') || 'Galaxy Movies <alerts@mail.galaxymovies.app>'
const TO = envVar('TIKTOK_EMAIL_TO')

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) { console.error('Usage: node scripts/tiktok-send.js <file.mp4> [...]'); process.exit(1) }
for (const f of files) if (!fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1) }
if (!API_KEY || !TO) {
  console.error('Need RESEND_API_KEY + TIKTOK_EMAIL_TO')
  process.exit(1)
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function main() {
  for (const file of files) {
    const sidecar = file.replace(/\.mp4$/i, '.txt')
    const caption = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8').trim() : path.basename(file)
    const title = caption.split('\n')[0]
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        subject: `TikTok ready: ${title}`,
        text: `${caption}\n\n—\nAttach the MP4 to a new TikTok post, paste the caption above.`,
        html: `<p>Today's video is attached — post it from the TikTok app:</p><ol><li>Save the attached MP4 to your phone</li><li>TikTok app → + → upload it</li><li>Paste this caption:</li></ol><pre style="font-size:14px; background:#f4f4f5; padding:12px; border-radius:8px; white-space:pre-wrap;">${esc(caption)}</pre>`,
        attachments: [{ filename: path.basename(file), content: fs.readFileSync(file).toString('base64') }],
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`resend failed for ${file}: ${r.status} ${j.message || ''}`)
    console.log(`sent ${file} -> ${TO} (id ${j.id})`)
  }
}

main().catch((err) => { console.error(err.message || err); process.exitCode = 1 })
