// Renders the Devvit catalog assets for the still-streaming app via the
// shared spiral renderer: icon centered, wide shots with the galaxy right of
// center so Reddit's text overlays stay clear. Seeded, deterministic.
// Usage: node scripts/generate-devvit-assets.js
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { buildPlusFrame } = require('./generate-plus-backdrop')

const OUT_DIR = path.join(__dirname, '..', 'social')

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const jobs = [
    // Promotional icon — square, galaxy fills the frame.
    { file: 'devvit-icon-512.png', width: 512, height: 512, compose: { cx: 0.5, cy: 0.5, r: 0.40 } },
    // Featuring asset — recommended 1500x1000.
    { file: 'devvit-featuring-1500x1000.png', width: 1500, height: 1000, compose: { cx: 0.68, cy: 0.46, r: 0.52 } },
    // Tile image — recommended 560x256.
    { file: 'devvit-tile-560x256.png', width: 560, height: 256, compose: { cx: 0.70, cy: 0.50, r: 0.46 } }
  ]
  for (const j of jobs) {
    const frame = buildPlusFrame({ ...j, seed: 20261011 })
    const dest = path.join(OUT_DIR, j.file)
    await sharp(frame, { raw: { width: j.width, height: j.height, channels: 3 } }).png().toFile(dest)
    const info = await sharp(dest).metadata()
    const kb = Math.round(fs.statSync(dest).size / 1024)
    console.log(`${j.file}: ${info.width}x${info.height} ${kb}KB`)
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
