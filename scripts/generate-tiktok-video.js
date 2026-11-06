// Daily-diff TikTok generator: pulls a provider's streaming-changes diff
// (changes:diff:{provider} from Upstash), renders 1080x1920 slides through
// next/og (same stack as /api/og and the email logo), and concatenates them
// into an MP4 with ffmpeg. Post the video manually — TikTok's Content Posting
// API needs an approved app before it can be automated.
//
// Usage: node scripts/generate-tiktok-video.js [--provider netflix]
//        [--kind added|left|coming] [--count 5] [--out shots/tiktok]
//        [--api https://www.galaxymovies.app] [--slides-only]
//
// --api reads the public /api/streaming-changes feed instead of Redis —
// the tiktok.yml workflow uses it so CI needs no Upstash secrets.
//
// Slides always write to {out}/{date}-{provider}-{kind}/. MP4 assembles when
// ffmpeg is available (devDep ffmpeg-static, or ffmpeg on PATH).
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ImageResponse } = require('next/og')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const PROVIDER = arg('provider', 'netflix')
const KIND = arg('kind', 'added')
const COUNT = Number(arg('count', 5))
const OUT_DIR = arg('out', path.join(ROOT, 'shots', 'tiktok'))
const SLIDES_ONLY = process.argv.includes('--slides-only')
const API_BASE = arg('api', '').replace(/\/+$/, '')

const env = {}
const envPath = path.join(ROOT, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const envVar = (name) => process.env[name] || env[name]
const TMDB_KEY = envVar('TMDB_API_KEY')
const KV_URL = envVar('UPSTASH_REDIS_KV_REST_API_URL')
const KV_TOKEN = envVar('UPSTASH_REDIS_KV_REST_API_READ_ONLY_TOKEN') || envVar('UPSTASH_REDIS_KV_REST_API_TOKEN')
if (!TMDB_KEY) { console.error('Need TMDB_API_KEY'); process.exit(1) }
if (!API_BASE && (!KV_URL || !KV_TOKEN)) {
  console.error('Need UPSTASH Redis env vars in .env.local, or pass --api <site url>')
  process.exit(1)
}

// Provider display names for the headline — keys match PROVIDER_NAME_MATCH.
const NAMES = {
  'amazon-prime-video': 'Prime Video',
  'apple-tv': 'Apple TV+',
  'disney-plus': 'Disney+',
  'paramount-plus': 'Paramount+',
  'roku-channel': 'The Roku Channel',
  'amc-plus': 'AMC+',
  'pluto-tv': 'Pluto TV',
  'peacock-premium': 'Peacock',
}
const displayName = (key) => NAMES[key] || key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

const KIND_META = {
  added: { headline: (n, p) => `${n} new on ${p}`, badge: 'NEW', badgeBg: '#276749' },
  left: { headline: (n, p) => `leaving ${p} soon`, badge: 'LEAVING', badgeBg: '#9b2c2c' },
  coming: { headline: (n, p) => `coming to ${p}`, badge: 'COMING', badgeBg: '#975a16' },
}
const meta = KIND_META[KIND]
if (!meta) { console.error(`--kind must be one of ${Object.keys(KIND_META).join('|')}`); process.exit(1) }

const W = 1080
const H = 1920
const C = { canvas: '#14181c', raised: '#1f252b', overlay: '#2a3138', deep: '#001e2e', accent: '#2b6cb0' }
const FONTS = [
  { name: 'Inter', weight: 400, data: fs.readFileSync(path.join(ROOT, 'public/fonts/Inter-Regular.ttf')) },
  { name: 'Inter', weight: 700, data: fs.readFileSync(path.join(ROOT, 'public/fonts/Inter-Bold.ttf')) },
]

// Easing helpers driving the hook-slide intro animation (t is 0..1).
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)))
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

const slide = (children) => new ImageResponse(
  {
    type: 'div',
    props: {
      style: {
        width: W, height: H, display: 'flex', flexDirection: 'column',
        backgroundColor: C.canvas, fontFamily: 'Inter', color: '#f7fafc',
        padding: '72px 64px', position: 'relative'
      },
      children: [
        children,
        // Footer wordmark on every slide
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', bottom: 48, left: 0, width: '100%',
              display: 'flex', justifyContent: 'center',
              fontSize: 46, fontWeight: 700, color: '#a0aec0', letterSpacing: '0.06em'
            },
            children: 'galaxymovies.app'
          }
        }
      ]
    }
  },
  { width: W, height: H, fonts: FONTS }
)

// t drives the intro: a clean fade+scale that lands at rest — no positional
// travel or drift, which reads as floating on mobile.
const hookSlide = (n, provider, t = 1) => {
  const pEyebrow = easeOut(seg(t, 0, 0.5))
  const pHead = easeOut(seg(t, 0.2, 1))
  return slide(
    {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', textAlign: 'center' },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: 60, fontWeight: 700, color: '#63b3ed', letterSpacing: '0.14em', marginBottom: 36,
                opacity: pEyebrow, transform: `scale(${0.9 + 0.1 * pEyebrow})`
              },
              children: 'THIS WEEK'
            }
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: 140, fontWeight: 700, lineHeight: 1.12,
                opacity: easeOut(seg(t, 0.2, 0.7)),
                transform: `scale(${0.88 + 0.12 * pHead})`
              },
              children: meta.headline(n, displayName(provider))
            }
          },
        ]
      }
    }
  )
}

const titleSlide = (t, i, posterDataUri) => slide(
  {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 48, textAlign: 'center' },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: 26 },
            children: [
              { type: 'div', props: { style: { fontSize: 60, color: '#718096', fontWeight: 700 }, children: `#${i + 1}` } },
              {
                type: 'div',
                props: {
                  style: {
                    backgroundColor: meta.badgeBg, color: '#fff', fontSize: 40, fontWeight: 700,
                    padding: '14px 30px', borderRadius: 16, letterSpacing: '0.08em'
                  },
                  children: meta.badge
                }
              }
            ]
          }
        },
        posterDataUri && {
          type: 'img',
          props: {
            src: posterDataUri, width: 620, height: 930,
            style: { borderRadius: 32, objectFit: 'cover' }
          }
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, maxWidth: 940 },
            children: [
              { type: 'div', props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.12 }, children: t.title } },
              t.year ? { type: 'div', props: { style: { fontSize: 50, color: '#a0aec0' }, children: String(t.year) } } : null,
            ].filter(Boolean)
          }
        }
      ].filter(Boolean)
    }
  }
)

const ctaSlide = () => slide(
  {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', textAlign: 'center' },
      children: [
        { type: 'div', props: { style: { fontSize: 66, color: '#a0aec0', marginBottom: 40 }, children: 'Every arrival & departure,' } },
        { type: 'div', props: { style: { fontSize: 124, fontWeight: 700, lineHeight: 1.15 }, children: 'tracked daily.' } },
        { type: 'div', props: { style: { fontSize: 52, color: '#63b3ed', marginTop: 52 }, children: 'Free alerts when your watchlist moves' } },
      ]
    }
  }
)

async function redisGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } })
  const j = await r.json()
  return j.result ? JSON.parse(j.result) : null
}

async function getDiff() {
  if (!API_BASE) return redisGet(`changes:diff:${PROVIDER}`)
  const r = await fetch(`${API_BASE}/api/streaming-changes?provider=${PROVIDER}`)
  if (!r.ok) throw new Error(`/api/streaming-changes?provider=${PROVIDER}: ${r.status}`)
  return r.json()
}

async function tmdb(pathname) {
  const r = await fetch(`https://api.themoviedb.org/3${pathname}?api_key=${TMDB_KEY}`)
  if (!r.ok) throw new Error(`TMDB ${pathname}: ${r.status}`)
  return r.json()
}

const toDataUri = async (posterPath) => {
  if (!posterPath) return null
  const buf = Buffer.from(await (await fetch(`https://image.tmdb.org/t/p/w500${posterPath}`)).arrayBuffer())
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

const ffmpegBin = () => {
  try {
    const bin = require('ffmpeg-static')
    if (bin && fs.existsSync(bin)) return bin
  } catch { /* not a dep, or its install script wasn't approved */ }
  return 'ffmpeg' // PATH fallback — spawnSync reports ENOENT if absent
}

async function renderSlide(imageResponse, outPath) {
  const png = Buffer.from(await imageResponse.arrayBuffer())
  await sharp(png).png().toFile(outPath)
}

async function main() {
  const diff = await getDiff()
  if (!diff) { console.error(`No diff data for provider "${PROVIDER}"`); process.exit(1) }
  const pool = (diff[KIND] || [])
    .filter((t) => t?.tmdbId && t.title)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, COUNT)
  if (!pool.length) { console.error(`changes:diff:${PROVIDER}.${KIND} is empty`); process.exit(1) }

  const stamp = new Date().toISOString().slice(0, 10)
  const dir = path.join(OUT_DIR, `${stamp}-${PROVIDER}-${KIND}`)
  fs.mkdirSync(dir, { recursive: true })

  // Poster paths aren't in the diff payload — one detail call per title.
  const titles = await Promise.all(pool.map(async (t) => {
    try {
      const d = await tmdb(`/${t.tmdbType === 'tv' ? 'tv' : 'movie'}/${t.tmdbId}`)
      return { ...t, posterDataUri: await toDataUri(d.poster_path) }
    } catch {
      return { ...t, posterDataUri: null }
    }
  }))

  // 1s fade+scale intro, then a static hold — motion stops cleanly.
  const POP_FRAMES = 30
  const slides = [
    ...Array.from({ length: POP_FRAMES }, (_, i) => ({ resp: hookSlide(titles.length, PROVIDER, (i + 1) / POP_FRAMES), dur: 1 / 30 })),
    { resp: hookSlide(titles.length, PROVIDER, 1), dur: 1.4 },
    ...titles.map((t, i) => ({ resp: titleSlide(t, i, t.posterDataUri), dur: 2.6 })),
    { resp: ctaSlide(), dur: 2.2 }
  ]

  const files = []
  for (let i = 0; i < slides.length; i++) {
    const file = path.join(dir, `slide-${String(i).padStart(2, '0')}.png`)
    await renderSlide(slides[i].resp, file)
    files.push({ file, dur: slides[i].dur })
  }
  console.log(`${files.length} slides -> ${dir}`)

  const mp4 = path.join(OUT_DIR, `${stamp}-${PROVIDER}-${KIND}.mp4`)
  if (SLIDES_ONLY) { console.log('--slides-only: done'); return }
  const bin = ffmpegBin()
  if (!bin) {
    console.log('No ffmpeg found — slides are still postable as a TikTok photo carousel. `npm i -D ffmpeg-static` or install ffmpeg for the MP4.')
    return
  }
  // One entry per output frame via a numbered sequence (hardlinks for the
  // repeat frames) — concat-duration rounding drops/dups frames at 30fps.
  const seqDir = path.join(dir, 'frames')
  fs.mkdirSync(seqDir, { recursive: true })
  let fi = 0
  for (const f of files) {
    const reps = Math.max(1, Math.round(f.dur * 30))
    for (let k = 0; k < reps; k++) {
      const dest = path.join(seqDir, `${String(fi++).padStart(5, '0')}.png`)
      try { fs.linkSync(f.file, dest) } catch { fs.copyFileSync(f.file, dest) }
    }
  }
  const r = spawnSync(bin, [
    '-y', '-framerate', '30', '-i', path.join(seqDir, '%05d.png'),
    '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '20', '-movflags', '+faststart', mp4
  ], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`ffmpeg exited ${r.status} — slides still usable at ${dir}`)
    process.exit(1)
  }
  console.log(`mp4 -> ${mp4}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
