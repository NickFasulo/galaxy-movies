import type { GetServerSidePropsContext } from 'next'
import { setSwrCache } from '../utils/ssr'
import { SITE_URL } from '../utils/site'

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  res.setHeader('Content-Type', 'text/plain')
  setSwrCache(res, 86400, 604800)

  res.write(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`)
  res.end()

  return { props: {} }
}

export default function Robots() {
  return null
}