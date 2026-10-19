// Renders the Devvit catalog assets for the still-streaming trivia game:
// shared nebula starfield + a glowing "?" glyph (SDF, same technique as the
// fallback icon stamp) with a faint orbital ring. Seeded, deterministic.
// Usage: node scripts/generate-devvit-assets.js
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { buildFrame } = require('./generate-backdrop-fallback')

const OUT_DIR = path.join(__dirname, '..', 'social')
const SEED = 20261011

// "?" in normalized glyph coords (y down): partial annulus arc, a stem
// descending from the arc's bottom center, and a dot.
function qmarkSdf(nx, ny) {
  const acy = ny + 0.30
  const ang = (Math.atan2(acy, nx) * 180) / Math.PI
  const ring = Math.abs(Math.hypot(nx, acy) - 0.42) - 0.10
  // lower-left opening: inside the cut wedge, fall back to distance to the
  // arc's two end caps so the glow doesn't clip at the cut rays
  const capDown = Math.hypot(nx, ny - 0.12)
  const capLeft = Math.hypot(nx + 0.42, ny + 0.30)
  const arc = ang > 90 && ang < 180 ? Math.min(capDown, capLeft) - 0.10 : ring
  const stem = Math.max(Math.abs(nx) - 0.085, Math.max(0.12 - ny, ny - 0.48))
  const dot = Math.hypot(nx, ny - 0.75) - 0.11
  return Math.min(arc, stem, dot)
}

// Thin tilted ellipse, a nod to the spiral brand.
function orbitSdf(nx, ny) {
  const t = -0.35
  const rx = nx * Math.cos(t) + ny * Math.sin(t)
  const ry = -nx * Math.sin(t) + ny * Math.cos(t)
  return Math.abs(Math.hypot(rx / 0.92, ry / 0.34) - 1) * 0.92 - 0.015
}

const CORE = [1.0, 0.90, 0.70]
const GLOW = [0.60, 0.72, 1.0]
const ORBIT = [0.55, 0.65, 0.95]

function stamp(buf, W, H, cx, cy, R) {
  const pad = Math.ceil(R * 1.6)
  for (let y = Math.max(0, cy - pad); y < Math.min(H, cy + pad); y++) {
    for (let x = Math.max(0, cx - pad); x < Math.min(W, cx + pad); x++) {
      const nx = (x - cx) / R
      const ny = (y - cy) / R
      const i = (y * W + x) * 3

      // buf holds 0-255 bytes; blend targets are scaled up from 0-1 colors
      const do_ = orbitSdf(nx, ny)
      const oa = Math.min(Math.max(0.5 - do_ * R * 0.35, 0), 1) * 0.35
      if (oa > 0.001) {
        buf[i] += (ORBIT[0] * 255 - buf[i]) * oa
        buf[i + 1] += (ORBIT[1] * 255 - buf[i + 1]) * oa
        buf[i + 2] += (ORBIT[2] * 255 - buf[i + 2]) * oa
      }

      const d = qmarkSdf(nx, ny)
      const alpha = Math.min(Math.max(0.5 - d * R * 0.5, 0), 1)
      const glow = d > 0 ? Math.exp(-d * 7) * 0.5 : 0
      if (alpha > 0.001) {
        buf[i] += (CORE[0] * 255 - buf[i]) * alpha * 0.96
        buf[i + 1] += (CORE[1] * 255 - buf[i + 1]) * alpha * 0.96
        buf[i + 2] += (CORE[2] * 255 - buf[i + 2]) * alpha * 0.96
      }
      if (glow > 0.004 && alpha < 1) {
        const g = glow * (1 - alpha)
        buf[i] += (GLOW[0] * 255 - buf[i]) * g
        buf[i + 1] += (GLOW[1] * 255 - buf[i + 1]) * g
        buf[i + 2] += (GLOW[2] * 255 - buf[i + 2]) * g
      }
    }
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const jobs = [
    { file: 'devvit-icon-512.png', width: 512, height: 512, cx: 0.5, cy: 0.5, r: 0.42 },
    { file: 'devvit-featuring-1500x1000.png', width: 1500, height: 1000, cx: 0.66, cy: 0.5, r: 0.34 },
    { file: 'devvit-tile-560x256.png', width: 560, height: 256, cx: 0.68, cy: 0.5, r: 0.40 }
  ]
  for (const j of jobs) {
    const frame = buildFrame({ width: j.width, height: j.height, seed: SEED })
    stamp(frame, j.width, j.height, Math.round(j.width * j.cx), Math.round(j.height * j.cy), Math.round(Math.min(j.width, j.height) * j.r))
    const dest = path.join(OUT_DIR, j.file)
    await sharp(frame, { raw: { width: j.width, height: j.height, channels: 3 } }).png().toFile(dest)
    console.log(`${j.file}: ${Math.round(fs.statSync(dest).size / 1024)}KB`)
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
