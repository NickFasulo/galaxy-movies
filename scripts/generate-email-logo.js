// Renders the email header logo: the homepage Wordmark ("Galaxy Movies" in
// SpaceRanger Laser Italic in navy on white) rasterized
// via next/og — the same path /api/og uses — because Gmail/Outlook drop SVG
// images and can't be trusted to load web fonts. Deterministic; re-run after
// font or theme changes.
// Usage: node scripts/generate-email-logo.js
const path = require('path')
const { readFileSync } = require('fs')
const { ImageResponse } = require('next/og')
const sharp = require('sharp')

const FONT = path.join(__dirname, '..', 'public', 'fonts', 'SpaceRangerLaserItalic-J7an.otf')
const OUT = path.join(__dirname, '..', 'public', 'email-logo-light.png')

async function main() {
  const res = new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          fontFamily: 'SpaceRangerLaserItalic',
          fontSize: '96px',
          color: '#172554',
          letterSpacing: '0.04em',
          lineHeight: 1,
          backgroundColor: '#ffffff',
          padding: '48px 56px',
          display: 'flex'
        },
        children: 'Galaxy Movies'
      }
    },
    {
      width: 1200,
      height: 300,
      fonts: [{ name: 'SpaceRangerLaserItalic', data: readFileSync(FONT) }]
    }
  )
  const png = Buffer.from(await res.arrayBuffer())
  // Flatten first so transparent canvas edges do not prevent white-space trimming.
  const flat = await sharp(png).flatten({ background: '#ffffff' }).png().toBuffer()
  const ink = await sharp(flat).trim({ background: '#ffffff', threshold: 8 }).png().toBuffer()
  const { width, height } = await sharp(ink).metadata()
  await sharp({ create: { width: 1200, height: 300, channels: 3, background: '#ffffff' } })
    .composite([{ input: ink, left: Math.floor((1200 - width) / 2), top: Math.floor((300 - height) / 2) }])
    .png().toFile(OUT)
  const meta = await sharp(OUT).metadata()
  console.log(`email-logo-light.png: ${meta.width}x${meta.height}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
