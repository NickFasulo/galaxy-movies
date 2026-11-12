// Renders the EarlyHound home-feed promo banner (1200x200, 6:1): the spiral
// galaxy centered behind the SpaceRanger wordmark over a muted nebula
// starfield, with the site's two taglines side by side below. Drawn at 4x and
// downscaled for crisp text. Seeded, deterministic.
// Output goes to shots/ (untracked) — the banner is a one-off artifact for the
// EarlyHound listing, not a shipped asset.
// Usage: node scripts/generate-earlyhound-banner.js
const path = require('path')
const { readFileSync } = require('fs')
const { ImageResponse } = require('next/og')
const sharp = require('sharp')
const { buildPlusFrame } = require('./generate-plus-backdrop')

const W = 1200
const H = 200
const S = 4
const RW = W * S
const RH = H * S
const SEED = 20261111
const FONT_DIR = path.join(__dirname, '..', 'public', 'fonts')
const OUT = path.join(__dirname, '..', 'shots', 'earlyhound-banner-1200x200-v2.png')

function tagline(text) {
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: `${20 * S}px`,
        color: 'rgba(195, 215, 245, 0.92)',
        letterSpacing: '0.02em',
        lineHeight: 1,
        textShadow: `0 0 ${6 * S}px rgba(0,0,0,0.8)`,
        display: 'flex'
      },
      children: text
    }
  }
}

async function main() {
  const frame = buildPlusFrame({
    width: RW,
    height: RH,
    seed: SEED,
    compose: { cx: 0.5, cy: 0.5, r: 2.2 },
    nebula: 0.7
  })
  const bg = await sharp(frame, { raw: { width: RW, height: RH, channels: 3 } }).png().toBuffer()

  const res = new ImageResponse(
    {
      type: 'div',
      props: {
        style: { width: '100%', height: '100%', display: 'flex', position: 'relative' },
        children: [
          {
            type: 'img',
            props: {
              src: `data:image/png;base64,${bg.toString('base64')}`,
              width: RW,
              height: RH,
              style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }
            }
          },
          // Scrim so the wordmark stays readable over the bright galactic core.
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                background:
                  'radial-gradient(ellipse at 50% 50%, rgba(0,8,18,0.55) 0%, rgba(0,8,18,0.25) 45%, rgba(0,8,18,0.0) 75%)'
              }
            }
          },
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'SpaceRangerLaserItalic',
                      fontSize: `${94 * S}px`,
                      color: '#ffffff',
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      textShadow: `0 0 ${14 * S}px rgba(125, 175, 255, 0.45)`,
                      marginBottom: `${16 * S}px`,
                      display: 'flex'
                    },
                    children: 'Galaxy Movies'
                  }
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: `${64 * S}px` },
                    children: [
                      tagline('Decide what to watch tonight'),
                      tagline('Alerts before it leaves your services')
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    },
    {
      width: RW,
      height: RH,
      fonts: [
        { name: 'SpaceRangerLaserItalic', data: readFileSync(path.join(FONT_DIR, 'SpaceRangerLaserItalic-J7an.otf')) },
        { name: 'Inter', data: readFileSync(path.join(FONT_DIR, 'Inter-Regular.ttf')), weight: 400 }
      ]
    }
  )

  const png = Buffer.from(await res.arrayBuffer())
  await sharp(png).resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 0.5 }).png().toFile(OUT)
  const meta = await sharp(OUT).metadata()
  console.log(`${path.relative(process.cwd(), OUT)}: ${meta.width}x${meta.height}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
