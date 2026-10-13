// Renders the PWA/touch icons: a centered two-arm spiral galaxy on deep space,
// same visual family as backdrop_plus. Seeded, deterministic. Maskable variants
// shrink the galaxy so it survives Android's 80%-diameter safe-zone masks.
// Usage: node scripts/generate-icons.js
const sharp = require('sharp')
const path = require('path')
const { mulberry32, makeNoiseLayer, fbm } = require('./generate-backdrop-fallback')

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons')

// radiusScale = galaxy radius as a fraction of width; 0.30 keeps arms inside
// the maskable safe zone, 0.42 fills a standard icon.
function buildIconFrame({ width: W, height: H, seed, radiusScale }) {
  const rand = mulberry32(seed)
  const aspect = W / H
  const gs = (s) => Math.max(1, Math.round(s * aspect * 1.125))

  const nebDensity = [4, 8, 16].map((s) => makeNoiseLayer(rand, gs(s), s))
  const nebFil = [6, 12, 24].map((s) => makeNoiseLayer(rand, gs(s), s))
  const nebHue = [3, 6].map((s) => makeNoiseLayer(rand, gs(s), s))
  const warpA = makeNoiseLayer(rand, 10, 10)
  const warpB = makeNoiseLayer(rand, 10, 10)
  const grain = makeNoiseLayer(rand, gs(24), 14)
  const clump = [6, 12, 24].map((s) => makeNoiseLayer(rand, s, s))
  const knot = makeNoiseLayer(rand, 20, 20)

  const buf = new Float32Array(W * H * 3)

  const BLUE = [0.16, 0.28, 0.48]
  const PURPLE = [0.36, 0.19, 0.48]
  const CORE = [1.0, 0.90, 0.70]
  const ARM_IN = [0.98, 0.84, 0.60]
  const ARM_MID = [0.60, 0.72, 1.0]
  const ARM_OUT = [0.52, 0.60, 0.98]
  const PINK = [1.0, 0.42, 0.60]
  const DISC = [0.55, 0.62, 0.85]

  const CX = W * 0.5
  const CY = H * 0.5
  const R = W * radiusScale
  const RC = R * 0.085
  const RD = R * 0.40
  const TILT = -0.42
  const COSI = 0.62
  const K = 1 / Math.tan(0.33)
  const R0 = R * 0.14
  const ARM_RAMP = R * 0.07
  const BOUND2 = (R * 1.18) * (R * 1.18)

  const cosT = Math.cos(TILT)
  const sinT = Math.sin(TILT)
  const angDiff = (a) => Math.atan2(Math.sin(a), Math.cos(a))
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

  for (let y = 0; y < H; y++) {
    const v = y / H
    for (let x = 0; x < W; x++) {
      const u = x / W
      const i = (y * W + x) * 3

      const gdx = u - 0.5
      const gdy = v - 0.5
      const rr = Math.sqrt(gdx * gdx + gdy * gdy)
      const base = 0.062 - 0.030 * Math.min(rr * 1.4, 1) + 0.007 * grain(u, v)
      buf[i] = base * 0.5
      buf[i + 1] = base * 0.72
      buf[i + 2] = base * 1.4

      const wu = u + 0.09 * (warpA(u, v) - 0.5)
      const wv = v + 0.09 * (warpB(u, v) - 0.5)
      const density = fbm(nebDensity, wu, wv)
      const ridge = 1 - Math.abs(2 * fbm(nebFil, wu * 0.72 + 1.3, wv * 1.15 + 4.6) - 1)
      const band = Math.exp(-(rr * rr) / (2 * 0.30 * 0.30))
      const diffuse = Math.max(0, density - 0.38) * 0.5 * band
      const gate = Math.min(Math.max((density - 0.42) * 6, 0), 1)
      const fil = Math.pow(ridge, 9) * band * gate * 0.5
      if (diffuse > 0.001 || fil > 0.001) {
        const hue = fbm(nebHue, wu + 3.7, wv + 9.1)
        const mix = Math.min(Math.max((hue - 0.40) * 4.0, 0), 1)
        buf[i] += diffuse * (BLUE[0] + (PURPLE[0] - BLUE[0]) * mix) * 0.25 + fil * (0.20 + 0.10 * mix)
        buf[i + 1] += diffuse * (BLUE[1] + (PURPLE[1] - BLUE[1]) * mix) * 0.25 + fil * (0.33 - 0.08 * mix)
        buf[i + 2] += diffuse * (BLUE[2] + (PURPLE[2] - BLUE[2]) * mix) * 0.25 + fil * 0.48
      }

      const px = x - CX
      const py = y - CY
      const d2 = px * px + py * py
      if (d2 >= BOUND2) continue

      const gx = px * cosT + py * sinT
      const gy = (-px * sinT + py * cosT) / COSI
      const r = Math.sqrt(gx * gx + gy * gy)
      const theta = Math.atan2(gy, gx)
      const winding = theta - K * Math.log(r / R0)

      const sigma = 0.28 + 0.55 * (r / R)
      const dArm = Math.min(Math.abs(angDiff(winding)), Math.abs(angDiff(winding - Math.PI)))
      const arm = Math.exp(-(dArm * dArm) / (2 * sigma * sigma))

      const armOn = smooth((r - ARM_RAMP) / (R * 0.10))
      const env = Math.exp(-Math.max(0, r - R * 0.04) / RD)
      const edge = 1 - smooth((r - R * 0.78) / (R * 0.22))
      const clumpF = fbm(clump, gx / R + 2.0, gy / R + 7.0)
      const armAmt = arm * env * edge * armOn * (0.55 + 1.05 * clumpF)
      const discAmt = env * edge * 0.20
      const coreAmt = Math.exp(-(r * r) / (2 * RC * RC)) * 1.6

      const knotV = knot(gx / R + 0.5, gy / R + 0.5)
      const pinkAmt = arm * env * edge * armOn * Math.max(0, knotV - 0.60) * 2.4

      const sigmaDust = sigma * 0.6
      const dDust = Math.min(Math.abs(angDiff(winding + 0.26)), Math.abs(angDiff(winding - Math.PI + 0.26)))
      const dustAmt = Math.exp(-(dDust * dDust) / (2 * sigmaDust * sigmaDust)) * env * edge * armOn
      const dustMul = 1 - Math.min(dustAmt, 1) * 0.62

      const t = Math.min(r / R, 1)
      const ac = t < 0.35 ? lerp(ARM_IN, ARM_MID, t / 0.35) : lerp(ARM_MID, ARM_OUT, (t - 0.35) / 0.65)

      buf[i] += (armAmt * ac[0] + discAmt * DISC[0] + pinkAmt * PINK[0]) * dustMul + coreAmt * CORE[0]
      buf[i + 1] += (armAmt * ac[1] + discAmt * DISC[1] + pinkAmt * PINK[1]) * dustMul + coreAmt * CORE[1]
      buf[i + 2] += (armAmt * ac[2] + discAmt * DISC[2] + pinkAmt * PINK[2]) * dustMul + coreAmt * CORE[2]
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

  const ARM_STARS = Math.round(90 * (W * H) / (1024 * 1024))
  for (let s = 0; s < ARM_STARS; s++) {
    const r = R * (0.16 + 0.82 * Math.pow(rand(), 0.8))
    const phase = rand() < 0.5 ? 0 : Math.PI
    const theta = K * Math.log(r / R0) + phase + (rand() - 0.5) * 0.24
    const gx = Math.cos(theta) * r
    const gy = Math.sin(theta) * r
    const gySquash = gy * COSI
    const sx = gx * cosT - gySquash * sinT + CX
    const sy = gx * sinT + gySquash * cosT + CY
    stampStar(sx, sy, 0.6 + rand() * 1.1, 0.35 + rand() * 0.5, 0.72, 0.82, 1.0)
  }

  const STAR_COUNT = Math.round(900 * (W * H) / (1024 * 1024))
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

  const BRIGHT_STARS = Math.round(16 * (W * H) / (1024 * 1024))
  for (let s = 0; s < BRIGHT_STARS; s++) {
    const cx = rand() * W
    const cy = rand() * H
    const bright = 0.55 + rand() * 0.45
    stampStar(cx, cy, 1.4 + rand() * 1.2, bright, 0.9, 0.95, 1.0)
  }

  const out = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const dither = rand() - 0.5
      for (let c = 0; c < 3; c++) {
        const p = buf[i + c]
        out[i + c] = p < 0 ? 0 : p > 1 ? 255 : Math.round(p * 255 + dither)
      }
    }
  }
  return out
}

async function main() {
  const jobs = [
    // Standard icons: galaxy fills the frame.
    {
      frame: { width: 1024, height: 1024, seed: 20261011, radiusScale: 0.42 },
      targets: [
        { file: 'icon-512.png', size: 512 },
        { file: 'icon-192.png', size: 192 },
        { file: 'apple-touch-icon.png', size: 180 }
      ]
    },
    // Maskable: shrunken so launchers can crop to any shape within the safe zone.
    {
      frame: { width: 1024, height: 1024, seed: 20261011, radiusScale: 0.30 },
      targets: [
        { file: 'icon-maskable-512.png', size: 512 },
        { file: 'icon-maskable-192.png', size: 192 }
      ]
    }
  ]

  for (const job of jobs) {
    const frame = buildIconFrame(job.frame)
    const master = sharp(frame, { raw: { width: job.frame.width, height: job.frame.height, channels: 3 } })
    for (const t of job.targets) {
      const dest = path.join(OUT_DIR, t.file)
      await master.clone().resize(t.size, t.size).png().toFile(dest)
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
