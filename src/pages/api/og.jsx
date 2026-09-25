import { ImageResponse } from '@vercel/og'

export const config = {
  runtime: 'edge',
}

async function toJpegDataUri(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const CHUNK = 8192
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    return `data:${contentType};base64,${btoa(binary)}`
  } catch (err) {
    return null
  }
}

export default async function handler(req) {
  const reqUrl = new URL(req.url)
  const { searchParams, origin } = reqUrl

  const title = searchParams.get('title') || 'Galaxy Movies'
  const subtitle = searchParams.get('subtitle') || 'Discover Popular & New Films'
  const poster = searchParams.get('poster') || null

  const subtitleTrimmed =
    subtitle.length > 110 ? subtitle.slice(0, 107).trimEnd() + '…' : subtitle

  const titleFontSize =
    title.length > 40 ? '48px' : title.length > 24 ? '60px' : '76px'

  const [fontData, interBoldData, interRegularData, backdropDataUri, posterDataUri] =
    await Promise.all([
      fetch(`${origin}/fonts/SpaceRangerLaserItalic-J7an.otf`).then((r) => r.arrayBuffer()),
      fetch(`${origin}/fonts/Inter-Bold.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${origin}/fonts/Inter-Regular.ttf`).then((r) => r.arrayBuffer()),
      toJpegDataUri(`${origin}/backdrop_fallback.jpg`),
      poster ? toJpegDataUri(poster) : Promise.resolve(null),
    ])

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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#001e2e',
              borderRadius: '6px',
              padding: '6px 18px',
              transform: 'skewX(-15deg)',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                fontFamily: 'SpaceRangerLaserItalic',
                fontSize: '22px',
                color: '#ffffff',
                letterSpacing: '0.04em',
                transform: 'skewX(15deg)',
                display: 'flex',
              }}
            >
              galaxy movies
            </div>
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

  imageResponse.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  imageResponse.headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')

  return imageResponse
}