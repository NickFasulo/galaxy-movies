const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'

export async function getServerSideProps({ res }) {
  const urls = [`${siteUrl}/`, `${siteUrl}/disclosure`]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  res.status(200).send(xml)

  return { props: {} }
}

export default function Sitemap() {
  return null
}
