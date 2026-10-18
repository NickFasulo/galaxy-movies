// Renders social profile banners for the bot accounts via the shared spiral
// renderer: galaxy right-of-center over the nebula, so platform avatar/bio
// overlays (which sit bottom-left) stay clear. Seeded, deterministic.
// Usage: node scripts/generate-social-banner.js
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { buildPlusFrame } = require('./generate-plus-backdrop')

const OUT_DIR = path.join(__dirname, '..', 'social')

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const jobs = [
    // X / Bluesky / Mastodon all display ~3:1 headers.
    { file: 'social-banner-1500x500.png', width: 1500, height: 500, compose: { cx: 0.70, cy: 0.50, r: 0.44 } },
    // Reddit profile/subreddit "big" banner.
    { file: 'social-banner-1920x384.png', width: 1920, height: 384, compose: { cx: 0.60, cy: 0.50, r: 0.46 } },
    // Tumblr header (flexible ~2.85:1).
    { file: 'social-banner-3000x1055.png', width: 3000, height: 1055, compose: { cx: 0.68, cy: 0.50, r: 0.44 } }
  ]
  for (const j of jobs) {
    const frame = buildPlusFrame({ ...j, seed: 20261011 })
    const dest = path.join(OUT_DIR, j.file)
    await sharp(frame, { raw: { width: j.width, height: j.height, channels: 3 } }).png().toFile(dest)
    const info = await sharp(dest).metadata()
    console.log(`${j.file}: ${info.width}x${info.height}`)
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
