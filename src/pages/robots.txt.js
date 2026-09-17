const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'

export async function getServerSideProps({ res }) {
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')

  res.write(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`)
  res.end()

  return { props: {} }
}

export default function Robots() {
  return null
}