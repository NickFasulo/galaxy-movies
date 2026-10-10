const sharp = require('sharp')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'public')

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoiseLayer(rand, gw, gh) {
  const g = new Float32Array(gw * gh)
  for (let i = 0; i < g.length; i++) g[i] = rand()
  const at = (x, y) => g[(((y % gh) + gh) % gh) * gw + (((x % gw) + gw) % gw)]
  const cubic = (p0, p1, p2, p3, t) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * gw
    const y = (((v % 1) + 1) % 1) * gh
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const r0 = cubic(at(x0 - 1, y0 - 1), at(x0, y0 - 1), at(x0 + 1, y0 - 1), at(x0 + 2, y0 - 1), fx)
    const r1 = cubic(at(x0 - 1, y0), at(x0, y0), at(x0 + 1, y0), at(x0 + 2, y0), fx)
    const r2 = cubic(at(x0 - 1, y0 + 1), at(x0, y0 + 1), at(x0 + 1, y0 + 1), at(x0 + 2, y0 + 1), fx)
    const r3 = cubic(at(x0 - 1, y0 + 2), at(x0, y0 + 2), at(x0 + 1, y0 + 2), at(x0 + 2, y0 + 2), fx)
    return cubic(r0, r1, r2, r3, fy)
  }
}

function fbm(layers, u, v) {
  let sum = 0
  let amp = 1
  let norm = 0
  for (const layer of layers) {
    sum += amp * layer(u, v)
    norm += amp
    amp *= 0.55
  }
  return sum / norm
}

// signed distance to icon shape, coords normalized to icon half-size
function iconSdf(icon, nx, ny) {
  if (icon === 'avatar') {
    const head = Math.hypot(nx, ny + 0.42) - 0.34
    const shoulders = Math.hypot(nx / 0.74, (ny - 0.52) / 0.55) - 1
    return Math.min(head, shoulders)
  }
  const disc = Math.hypot(nx, ny) - 0.95
  let holes = Math.hypot(nx, ny) - 0.13
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5
    holes = Math.min(holes, Math.hypot(nx - Math.cos(a) * 0.56, ny - Math.sin(a) * 0.56) - 0.185)
  }
  const ta = 0.6
  const tx = nx - 0.98
  const ty = ny - 0.62
  const rx = tx * Math.cos(ta) + ty * Math.sin(ta)
  const ry = -tx * Math.sin(ta) + ty * Math.cos(ta)
  const qx = Math.abs(rx) - 0.32
  const qy = Math.abs(ry) - 0.10
  const tail = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.05
  return Math.max(Math.min(disc, tail), -holes)
}

function buildFrame({ width, height, seed, portrait = false, icon = null }) {
  const W = width
  const H = height
  const rand = mulberry32(seed)
  const aspect = W / H
  const gs = (s) => Math.max(1, Math.round(s * aspect * 1.125))

  const densityOctaves = [4, 8, 16].map((s) => makeNoiseLayer(rand, gs(s), s))
  const filamentOctaves = [6, 12, 24].map((s) => makeNoiseLayer(rand, gs(s), s))
  const hueOctaves = [3, 6].map((s) => makeNoiseLayer(rand, gs(s), s))
  const warpA = portrait ? makeNoiseLayer(rand, 8, 12) : makeNoiseLayer(rand, 12, 6)
  const warpB = portrait ? makeNoiseLayer(rand, 8, 12) : makeNoiseLayer(rand, 12, 6)
  const bandNoise = portrait ? makeNoiseLayer(rand, 1, 8) : makeNoiseLayer(rand, 8, 1)
  const grain = makeNoiseLayer(rand, gs(24), 14)

  const buf = new Float32Array(W * H * 3)

  const BLUE = [0.16, 0.28, 0.48]
  const PURPLE = [0.36, 0.19, 0.48]

  for (let y = 0; y < H; y++) {
    const v = y / H
    for (let x = 0; x < W; x++) {
      const u = x / W
      const i = (y * W + x) * 3

      const dx = (u - 0.5) * 1.6
      const dy = (v - 0.45) * 1.15
      const r = Math.sqrt(dx * dx + dy * dy)
      const base = 0.075 - 0.035 * Math.min(r, 1) + 0.008 * grain(u, v)
      buf[i] = base * 0.5
      buf[i + 1] = base * 0.72
      buf[i + 2] = base * 1.4

      const bandCenter = portrait
        ? 0.5 + 0.06 * Math.sin(v * 4.6 + 0.8) + 0.07 * (bandNoise(0.05, v) - 0.5)
        : 0.52 + 0.05 * Math.sin(u * 5.1 + 0.8) + 0.07 * (bandNoise(u, 0.05) - 0.5)
      const dBand = (portrait ? u : v) - bandCenter
      const band = Math.exp(-(dBand * dBand) / (2 * 0.19 * 0.19))

      const wu = u + 0.09 * (warpA(u, v) - 0.5)
      const wv = v + 0.09 * (warpB(u, v) - 0.5)

      const density = fbm(densityOctaves, wu, wv)
      const ridge = 1 - Math.abs(2 * fbm(filamentOctaves, wu * 0.72 + 1.3, wv * 1.15 + 4.6) - 1)

      const diffuse = Math.max(0, density - 0.36) * 0.75 * band
      const gate = Math.min(Math.max((density - 0.42) * 6, 0), 1)
      const core = Math.pow(ridge, 9) * band * gate
      const halo = Math.pow(ridge, 3) * band * gate * 0.12

      if (diffuse > 0.001 || core > 0.001) {
        const hue = fbm(hueOctaves, wu + 3.7, wv + 9.1)
        const mix = Math.min(Math.max((hue - 0.40) * 4.0, 0), 1)
        buf[i] += diffuse * (BLUE[0] + (PURPLE[0] - BLUE[0]) * mix) * 0.25 + halo * 0.06 + core * (0.20 + 0.10 * mix)
        buf[i + 1] += diffuse * (BLUE[1] + (PURPLE[1] - BLUE[1]) * mix) * 0.25 + halo * 0.11 + core * (0.33 - 0.08 * mix)
        buf[i + 2] += diffuse * (BLUE[2] + (PURPLE[2] - BLUE[2]) * mix) * 0.25 + halo * 0.20 + core * 0.48
      }
    }
  }

  function stampStar(cx, cy, sigma, amp, cr, cg, cb) {
    const rad = Math.ceil(sigma * 3)
    const x0 = Math.max(0, Math.floor(cx) - rad)
    const x1 = Math.min(W - 1, Math.floor(cx) + rad)
    const y0 = Math.max(0, Math.floor(cy) - rad)
    const y1 = Math.min(H - 1, Math.floor(cy) + rad)
    const inv = 1 / (2 * sigma * sigma)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy)
        const w = amp * Math.exp(-d2 * inv)
        if (w < 0.003) continue
        const i = (y * W + x) * 3
        buf[i] += w * cr
        buf[i + 1] += w * cg
        buf[i + 2] += w * cb
      }
    }
  }

  const STAR_COUNT = Math.round(3600 * (W * H) / (2560 * 1440))
  for (let s = 0; s < STAR_COUNT; s++) {
    const cx = rand() * W
    const cy = rand() * H
    const bright = 0.14 + Math.pow(rand(), 3.2) * 0.9
    const sigma = 0.55 + rand() * 0.75
    const tint = rand()
    let cr = 1, cg = 1, cb = 1
    if (tint < 0.18) {
      cr = 0.72; cg = 0.85; cb = 1.0
    } else if (tint < 0.30) {
      cr = 1.0; cg = 0.92; cb = 0.82
    }
    stampStar(cx, cy, sigma, bright, cr, cg, cb)
  }

  const BRIGHT_STARS = Math.round(45 * (W * H) / (2560 * 1440))
  for (let s = 0; s < BRIGHT_STARS; s++) {
    const cx = rand() * W
    const cy = rand() * H
    const bright = 0.55 + rand() * 0.45
    stampStar(cx, cy, 1.6 + rand() * 1.4, bright, 0.9, 0.95, 1.0)
  }

  if (icon) {
    const R = Math.min(W, H) * 0.19
    const cx = Math.round(W * 0.5)
    const cy = Math.round(H * 0.47)
    const pad = Math.ceil(R * 1.5)
    const ICON_RGB = [0.78, 0.84, 0.94]
    for (let y = Math.max(0, cy - pad); y < Math.min(H, cy + pad); y++) {
      for (let x = Math.max(0, cx - pad); x < Math.min(W, cx + pad); x++) {
        const nx = (x - cx) / R
        const ny = (y - cy) / R
        const d = iconSdf(icon, nx, ny)
        const alpha = Math.min(Math.max(0.5 - d * R * 0.6, 0), 1)
        const glow = d > 0 ? Math.exp(-d * 6) * 0.10 : 0
        const a = alpha * 0.9 + glow * (1 - alpha)
        if (a <= 0.001) continue
        const i = (y * W + x) * 3
        buf[i] += (ICON_RGB[0] - buf[i]) * a
        buf[i + 1] += (ICON_RGB[1] - buf[i + 1]) * a
        buf[i + 2] += (ICON_RGB[2] - buf[i + 2]) * a
      }
    }
  }

  const out = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    const v = y / H
    for (let x = 0; x < W; x++) {
      const u = x / W
      const dx = u - 0.5
      const dy = v - 0.5
      const vig = 1 - 0.20 * Math.pow(Math.sqrt(dx * dx + dy * dy) * 1.6, 2.2)
      const i = (y * W + x) * 3
      const dither = rand() - 0.5
      for (let c = 0; c < 3; c++) {
        const p = buf[i + c] * vig
        out[i + c] = p < 0 ? 0 : p > 1 ? 255 : Math.round(p * 255 + dither)
      }
    }
  }
  return out
}

async function main() {
  const jobs = [
    {
      frame: { width: 2560, height: 1440, seed: 20260921 },
      targets: [
        { file: 'backdrop_fallback_lg.webp', width: 2560, height: 1440, format: 'webp', opts: { quality: 82 } },
        { file: 'backdrop_fallback.webp', width: 1376, height: 768, format: 'webp', opts: { quality: 82 } },
        { file: 'backdrop_fallback.jpg', width: 1376, height: 768, format: 'jpeg', opts: { quality: 88, mozjpeg: true } }
      ]
    },
    {
      frame: { width: 800, height: 1200, seed: 20261008, portrait: true },
      targets: [
        { file: 'poster_fallback_galaxy.webp', width: 800, height: 1200, format: 'webp', opts: { quality: 82 } }
      ]
    },
    // poster_fallback.webp / profile_fallback.webp are intentionally absent —
    // this renderer produces the old icon designs. Their newer art is committed
    // directly; re-adding jobs here would overwrite it.
  ]

  for (const job of jobs) {
    const frame = buildFrame(job.frame)
    const master = sharp(frame, { raw: { width: job.frame.width, height: job.frame.height, channels: 3 } })
    for (const t of job.targets) {
      let img = master.clone()
      if (t.width !== job.frame.width) img = img.resize(t.width, t.height)
      img = t.format === 'webp' ? img.webp(t.opts) : img.jpeg(t.opts)
      const dest = path.join(OUT_DIR, t.file)
      await img.toFile(dest)
      const info = await sharp(dest).metadata()
      console.log(`${t.file}: ${info.width}x${info.height}`)
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { buildFrame }
