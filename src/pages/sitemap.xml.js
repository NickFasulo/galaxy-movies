import { fetchDiscoverMovies, movieCategories, movieGenres, streamingProviders } from '../utils/tmdb'
import { curatedLists } from '../utils/curatedLists'
import { getProviderGenreTargets } from '../utils/contentOpportunities'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'

const escapeXml = value =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const formatDate = (dateString) => {
  if (!dateString) return null
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

function urlEntry(loc, lastmod) {
  const escapedLoc = escapeXml(loc)
  return lastmod
    ? `  <url><loc>${escapedLoc}</loc><lastmod>${lastmod}</lastmod></url>`
    : `  <url><loc>${escapedLoc}</loc></url>`
}

const PAGES_PER_LIST = 2
const CREDITS_SAMPLE_SIZE = 60

export async function getServerSideProps({ res }) {
  const today = new Date().toISOString().split('T')[0]

  const staticEntries = [
    urlEntry(`${siteUrl}/`, today),
    urlEntry(`${siteUrl}/disclosure`, today),
    urlEntry(`${siteUrl}/about`, today),
    urlEntry(`${siteUrl}/privacy`, today),
    urlEntry(`${siteUrl}/terms`, today),
    urlEntry(`${siteUrl}/contact`, today),
    urlEntry(`${siteUrl}/streaming`, today),
    urlEntry(`${siteUrl}/streaming-in-india`, today),
    urlEntry(`${siteUrl}/new-on-streaming`, today),
    urlEntry(`${siteUrl}/lists`, today),
  ]

  const listingEntries = [
    ...Object.keys(movieCategories).map(category =>
      urlEntry(`${siteUrl}/browse/${category}`, today)
    ),
    ...Object.keys(movieGenres).map(genre =>
      urlEntry(`${siteUrl}/genre/${genre}`, today)
    ),
    ...Object.keys(streamingProviders).map(provider =>
      urlEntry(`${siteUrl}/streaming/${provider}`, today)
    ),
    ...getProviderGenreTargets().map(({ providerKey, genreKey }) =>
      urlEntry(`${siteUrl}/streaming/${providerKey}/${genreKey}`, today)
    ),
    ...Object.keys(curatedLists).map(slug =>
      urlEntry(`${siteUrl}/lists/${slug}`, today)
    ),
  ]

  const movieEntries = new Map()
  const personIds = new Set()
  const companyIds = new Set()

  try {
    const pageRange = Array.from({ length: PAGES_PER_LIST }, (_, i) => i + 1)
    const categories = Object.keys(movieCategories)
    const categoryResults = await Promise.all(
      categories.flatMap(category =>
        pageRange.map(page => fetchDiscoverMovies({ category, page }))
      )
    )

    const genreResults = await Promise.all(
      Object.values(movieGenres).flatMap(genre =>
        pageRange.map(page => fetchDiscoverMovies({ genreId: genre.id, page }))
      )
    )

    const allMovies = [
      ...categoryResults.flatMap(d => d?.results || []),
      ...genreResults.flatMap(d => d?.results || []),
    ]

    for (const movie of allMovies) {
      if (!movie?.id) continue
      if (!movieEntries.has(movie.id)) {
        const lastmod = formatDate(movie.release_date) || today
        movieEntries.set(movie.id, lastmod)
      }
    }

    const creditsSampleMovies = Array.from(movieEntries.keys())
      .slice(0, CREDITS_SAMPLE_SIZE)
      .map(id => allMovies.find(movie => movie.id === id))
      .filter(Boolean)
    const detailResults = await Promise.allSettled(
      creditsSampleMovies.map(movie =>
        fetch(
          `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${process.env.TMDB_API_KEY}&append_to_response=credits`
        ).then(r => r.ok ? r.json() : null)
      )
    )

    const KEY_CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Story', 'Producer'])

    for (const result of detailResults) {
      if (result.status !== 'fulfilled' || !result.value) continue
      const { credits, production_companies = [] } = result.value
      const { cast = [], crew = [] } = credits || {}
      const keyCrew = crew.filter(person => KEY_CREW_JOBS.has(person.job))

      for (const person of [...cast.slice(0, 10), ...keyCrew]) {
        if (person?.id) personIds.add(person.id)
      }
      for (const company of production_companies) {
        if (company?.id) companyIds.add(company.id)
      }
    }
  } catch (error) {
    console.error('Error fetching data for sitemap:', error)
  }

  const dynamicMovieEntries = Array.from(movieEntries, ([id, lastmod]) =>
    urlEntry(`${siteUrl}/movies/${id}`, lastmod)
  )

  const dynamicPersonEntries = Array.from(personIds, id =>
    urlEntry(`${siteUrl}/person/${id}`, today)
  )

  const dynamicCompanyEntries = Array.from(companyIds, id =>
    urlEntry(`${siteUrl}/company/${id}`, today)
  )

  const allEntries = [
    ...staticEntries,
    ...listingEntries,
    ...dynamicMovieEntries,
    ...dynamicPersonEntries,
    ...dynamicCompanyEntries,
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries.join('\n')}
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
