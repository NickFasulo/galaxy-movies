import type { NextApiRequest, NextApiResponse } from 'next'
import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'

async function toJpegDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    // Satori only understands png/jpeg/gif; TMDB's CDN serves webp even for .jpg
    // paths, and a webp data URI crashes the image pipeline, so skip it.
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(contentType)) return null
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const CHUNK = 8192
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    return `data:${contentType};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

// Only TMDB poster URLs are fetched server-side, so ?poster= can't be used for SSRF or as an open image proxy.
const TMDB_POSTER_PATTERN = /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\/[\w-]+\.(jpg|jpeg|png|webp)$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).send('Method Not Allowed')
  }

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'og_rl',
    maxRequests: 300,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', '3600')
    return res.status(429).send('Too Many Requests')
  }

  const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const title = (firstParam(req.query.title) || 'Galaxy Movies').slice(0, 120)
  const subtitle = (firstParam(req.query.subtitle) || 'Discover Popular & New Films').slice(0, 300)
  const posterParam = firstParam(req.query.poster)
  const poster = posterParam && TMDB_POSTER_PATTERN.test(posterParam) ? posterParam : null

  const subtitleTrimmed =
    subtitle.length > 110 ? subtitle.slice(0, 107).trimEnd() + '…' : subtitle

  const titleFontSize =
    title.length > 40 ? '48px' : title.length > 24 ? '60px' : '76px'

  // Read bundled assets from disk — a self-fetch to the site origin is an
  // unverified client to the edge and gets the bot-checkpoint HTML, not bytes.
  const [fontData, interBoldData, interRegularData, backdropBuf, posterDataUri] =
    await Promise.all([
      readFile(path.join(process.cwd(), 'public', 'fonts', 'SpaceRangerLaserItalic-J7an.otf')),
      readFile(path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf')),
      readFile(path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf')),
      readFile(path.join(process.cwd(), 'public', 'backdrop_fallback.jpg')),
      poster ? toJpegDataUri(poster) : Promise.resolve(null),
    ])
  const backdropDataUri = `data:image/jpeg;base64,${backdropBuf.toString('base64')}`

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0a0f14',
          position: 'relative',
          overflow: 'hidden',
          padding: '60px 72px',
        }}
      >
        {backdropDataUri && (
          <img
            src={backdropDataUri}
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '630px',
              objectFit: 'cover',
              objectPosition: 'center center',
              opacity: 0.22,
            }}
          />
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 38% 50%, rgba(0,18,32,0.0) 0%, rgba(0,18,32,0.55) 60%, rgba(0,18,32,0.92) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(0,10,18,0.96) 0%, rgba(0,10,18,0.70) 55%, rgba(0,10,18,0.10) 100%)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
            maxWidth: posterDataUri ? '720px' : '1050px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontFamily: 'SpaceRangerLaserItalic',
              fontSize: '36px',
              color: '#ffffff',
              letterSpacing: '0.04em',
              lineHeight: 1,
              textShadow: '0 0 14px rgba(125, 175, 255, 0.28)',
              marginBottom: '28px',
              display: 'flex',
            }}
          >
            Galaxy Movies
          </div>

          <div
            style={{
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: titleFontSize,
              color: '#ffffff',
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              marginBottom: '18px',
            }}
          >
            {title}
          </div>

          <div
            style={{
              width: '48px',
              height: '3px',
              borderRadius: '2px',
              background:
                'linear-gradient(90deg, rgba(100,160,255,0.9), rgba(100,160,255,0.2))',
              marginBottom: '18px',
            }}
          />

          <div
            style={{
              fontSize: '24px',
              fontFamily: 'Inter',
              fontWeight: 400,
              color: 'rgba(180,205,240,0.80)',
              lineHeight: 1.4,
              letterSpacing: '-0.01em',
              maxWidth: posterDataUri ? '640px' : '850px',
            }}
          >
            {subtitleTrimmed}
          </div>
        </div>

        {posterDataUri && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <img
              src={posterDataUri}
              width={210}
              height={315}
              style={{
                width: '210px',
                height: '315px',
                objectFit: 'cover',
                borderRadius: '10px',
                boxShadow:
                  '0 0 0 1px rgba(255,255,255,0.10), 0 32px 64px rgba(0,0,0,0.85)',
              }}
            />
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(80,140,255,0.6) 20%, rgba(140,190,255,1) 50%, rgba(80,140,255,0.6) 80%, transparent 100%)',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'SpaceRangerLaserItalic',
          data: fontData,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: interBoldData,
          weight: 700,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: interRegularData,
          weight: 400,
          style: 'normal',
        },
      ],
    }
  )

  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000')
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000')
  return res.send(Buffer.from(await imageResponse.arrayBuffer()))
}