import type { NextApiRequest, NextApiResponse } from 'next'
import type { ImageResponse as ImageResponseType } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { getClientIP, checkDistributedRateLimit } from '../../utils/core/rateLimiter'
import { getMonthlyChanges } from '../../utils/catalog/streamingChanges'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../utils/catalog/tmdb'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (date: string) => {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}` : date
}

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

  const slug = String(Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider || '')
  const provider = streamingProviders[slug]
  if (!provider || !PROVIDER_NAME_MATCH[slug]) return res.status(400).send('Unknown provider')

  const providerLabel = provider.title.replace(' Movies', '')
  const monthly = await getMonthlyChanges([slug]).then((m) => m[slug]).catch(() => undefined)
  const departed = (monthly?.departed || [])
    .filter((t) => t.tmdbId && t.title)
    .slice(0, 6)
    .map((t) => `${t.title}${t.date ? ` — ${dayLabel(t.date)}` : ''}`)

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long' })
  const headline = `Leaving ${providerLabel} in ${monthLabel}`
  const list = departed.length ? departed : ['Nothing tracked leaving yet this month']

  const [fontData, interBoldData, interRegularData, backdropBuf] = await Promise.all([
    readFile(path.join(process.cwd(), 'public', 'fonts', 'SpaceRangerLaserItalic-J7an.otf')),
    readFile(path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf')),
    readFile(path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf')),
    readFile(path.join(process.cwd(), 'public', 'backdrop_fallback.jpg'))
  ])
  const backdropDataUri = `data:image/jpeg;base64,${backdropBuf.toString('base64')}`

  const { ImageResponse } = (await (globalThis.navigator?.userAgent === 'Cloudflare-Workers'
    ? import(/* webpackIgnore: true */ 'next/dist/compiled/@vercel/og/index.edge.js')
    : import('next/og'))) as { ImageResponse: typeof ImageResponseType }

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          backgroundColor: '#0a0f14',
          position: 'relative',
          overflow: 'hidden',
          padding: '56px 72px',
        }}
      >
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
            opacity: 0.20,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(0,10,18,0.95) 0%, rgba(0,10,18,0.80) 55%, rgba(0,10,18,0.45) 100%)',
          }}
        />

        <div
          style={{
            fontFamily: 'SpaceRangerLaserItalic',
            fontSize: '34px',
            color: '#ffffff',
            letterSpacing: '0.04em',
            lineHeight: 1,
            textShadow: '0 0 14px rgba(125, 175, 255, 0.28)',
            marginBottom: '24px',
            display: 'flex',
            zIndex: 10,
          }}
        >
          Galaxy Movies
        </div>

        <div
          style={{
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: '60px',
            color: '#ffffff',
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            marginBottom: '28px',
            zIndex: 10,
            display: 'flex',
          }}
        >
          {headline}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 10 }}>
          {list.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '30px',
                color: 'rgba(210,228,255,0.92)',
                lineHeight: 1.25,
                display: 'flex',
              }}
            >
              {line.length > 58 ? `${line.slice(0, 55).trimEnd()}…` : line}
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '72px',
            fontFamily: 'Inter',
            fontWeight: 400,
            fontSize: '24px',
            color: 'rgba(150,180,220,0.75)',
            display: 'flex',
          }}
        >
          galaxymovies.app — tracked daily
        </div>

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
        { name: 'SpaceRangerLaserItalic', data: fontData, style: 'normal' },
        { name: 'Inter', data: interBoldData, weight: 700, style: 'normal' },
        { name: 'Inter', data: interRegularData, weight: 400, style: 'normal' }
      ],
    }
  )

  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800')
  res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800')
  return res.send(Buffer.from(await imageResponse.arrayBuffer()))
}
