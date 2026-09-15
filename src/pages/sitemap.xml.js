import { fetchDiscoverMovies, movieCategories, movieGenres, streamingProviders } from '../utils/tmdb'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxy-movies.vercel.app'

export async function getServerSideProps({ res }) {
  const urls = [
    `${siteUrl}/`,
    `${siteUrl}/disclosure`,
    `${siteUrl}/about`,
    `${siteUrl}/privacy`,
    `${siteUrl}/terms`,
    `${siteUrl}/contact`,
    ...Object.keys(movieCategories).map(category => `${siteUrl}/browse/${category}`),
    ...Object.keys(movieGenres).map(genre => `${siteUrl}/genre/${genre}`),
    ...Object.keys(streamingProviders).map(provider => `${siteUrl}/streaming/${provider}`)
  ]
  const movieIds = new Set()

  try {
    for (const category of Object.keys(movieCategories)) {
      const data = await fetchDiscoverMovies({ category })
      for (const movie of data.results || []) movieIds.add(movie.id)
    }
  } catch (error) {
    console.error(error)
  }

  urls.push(...Array.from(movieIds, id => `${siteUrl}/movies/${id}`))
  const escapeXml = value => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  res.statusCode = 200
  res.end(xml)

  return { props: {} }
}

export default function Sitemap() {
  return null
}
