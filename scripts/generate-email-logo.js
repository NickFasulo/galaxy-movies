// Rasterizes public/logo.svg to a transparent PNG for email clients — Gmail and
// Outlook drop SVG images entirely. The wordmark's homepage glow (Wordmark.tsx
// textShadow) is baked in as a blurred blue underlay. Deterministic; re-run
// after logo.svg changes.
// Usage: node scripts/generate-email-logo.js
const sharp = require('sharp')
const path = require('path')

const SRC = path.join(__dirname, '..', 'public', 'logo.svg')
const OUT = path.join(__dirname, '..', 'public', 'email-logo.png')

const WIDTH = 720 // ~3x the 240px display size in the email header
const PAD = 36 // canvas slack so the glow isn't clipped
const GLOW = { r: 125, g: 175, b: 255 } // matches Wordmark's rgba(125,175,255)

async function main() {
  const logo = await sharp(SRC, { density: 300 }).resize({ width: WIDTH }).png().toBuffer()
  const glow = await sharp(logo)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .tint(GLOW)
    .blur(9)
    .png()
    .toBuffer()
  await sharp(glow)
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(OUT)
  const meta = await sharp(OUT).metadata()
  console.log(`email-logo.png: ${meta.width}x${meta.height}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
