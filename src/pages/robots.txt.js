const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'

export async function getServerSideProps({ res }) {
  res.setHeader('Content-Type', 'text/plain')
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
