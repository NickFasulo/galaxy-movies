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
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // Breadcrumb targets Googlebot already found: keep the guessed parent paths
  // (and any stale links) from hard-404ing. /browse and /genre are real pages.
  async redirects() {
    return [
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