import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true'
})

const isDev = process.env.NODE_ENV !== 'production'

// Chakra/emotion inject inline styles and Next's pages router emits inline bootstrap
// scripts, hence 'unsafe-inline'. YouTube hosts are for the trailer player (VideoModal);
// api.web3forms.com is the contact form. Add new third-party origins here or they'll be blocked.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.web3forms.com${isDev ? ' ws:' : ''}`,
  // 'self' is here for the /widgets live preview, which iframes our own /embed pages.
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' }
]

// /embed/* pages are meant to be iframed on third-party sites: no X-Frame-Options,
// frame-ancestors opened to *, and noindex so the widgets themselves never rank.
const embedHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy.replace("frame-ancestors 'none'", 'frame-ancestors *') },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'X-Robots-Tag', value: 'noindex' }
]

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // /api/og reads these from disk (fs) — NFT doesn't always trace public/ files
  // into the serverless bundle, so pin them explicitly or the route 500s.
  outputFileTracingIncludes: {
    '/api/og': [
      './public/fonts/SpaceRangerLaserItalic-J7an.otf',
      './public/fonts/Inter-Bold.ttf',
      './public/fonts/Inter-Regular.ttf',
      './public/backdrop_fallback.jpg',
      // @vercel/og edge build + resvg wasm — loaded via dynamic import on
      // workerd (node build can't run there); nothing else traces it.
      './node_modules/next/dist/compiled/@vercel/og/**'
    ]
  },
  // Packages whose exports gate ESM builds behind a "workerd" condition must be
  // listed here so @opennextjs/cloudflare copies them whole — NFT only traces
  // the CJS variants, which leaves nothing for the worker bundle to resolve.
  serverExternalPackages: [
    '@emotion/react',
    '@emotion/utils',
    '@emotion/use-insertion-effect-with-fallbacks',
    '@emotion/cache',
    '@emotion/serialize',
    '@emotion/sheet',
    '@emotion/weak-memoize',
    '@emotion/hash',
    '@emotion/memoize',
    '@emotion/unitless',
    'hoist-non-react-statics',
    'uncrypto'
  ],
  async headers() {
    return [
      { source: '/((?!embed/).*)', headers: securityHeaders },
      { source: '/embed/:path*', headers: embedHeaders }
    ]
  },
  // Breadcrumb targets Googlebot already found: keep the guessed parent paths
  // (and any stale links) from hard-404ing. /browse and /genre are real pages.
  async redirects() {
    return [
      // The worker serves both apex and www custom domains; without this the
      // apex would serve duplicate content and rely on canonicals to dedupe.
      // First in the list so every apex path collapses in a single hop.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'galaxymovies.app' }],
        destination: 'https://www.galaxymovies.app/:path*',
        permanent: true
      },
      { source: '/movies', destination: '/', permanent: true },
      { source: '/person', destination: '/', permanent: true },
      { source: '/company', destination: '/', permanent: true },
      { source: '/network', destination: '/tv', permanent: true }
    ]
  },
  // First-party Umami proxy: cloud.umami.is and gateway.umami.is sit on ad-blocker
  // lists, so the tracker script and its /api/send beacon are served same-origin.
  // Path names deliberately avoid "umami"/"analytics"/"track" filter patterns.
  async rewrites() {
    return [
      { source: '/assets/starfield.js', destination: 'https://cloud.umami.is/script.js' },
      { source: '/starfield/api/send', destination: 'https://gateway.umami.is/api/send' }
    ]
  },
  images: {
    loader: 'custom',
    loaderFile: './src/utils/imageLoader.ts',
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384]
  }
}

export default withBundleAnalyzer(nextConfig)