import type { GetServerSidePropsContext } from 'next'
import type { TmdbMovieDetails, TmdbTvDetails, TmdbMovie, TmdbTvShow, TmdbPaged, Credits, AggregateCredits } from '../types/tmdb'
import { fetchDiscoverMovies, fetchDiscoverTv, fetchTmdb, isProviderAvailableInRegion, movieCategories, movieGenres, tvCategories, tvGenres, streamingProviders, PROVIDER_NAME_MATCH } from '../features/catalog/tmdb'
import { getTitleChangeIndex } from '../features/catalog/streamingChanges'
import { DEFAULT_REGION } from '../lib/region'
import { curatedLists } from '../features/catalog/curatedLists'
import { getGeneratedLists } from '../features/catalog/generatedLists'
import { getProviderGenreTargets, getTvProviderGenreTargets } from '../features/catalog/contentOpportunities'
import { franchiseCollectionIds } from '../features/catalog/franchises'
import { SITE_URL as siteUrl } from '../lib/site'
import { setSwrCache } from '../lib/http'

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

// lastmod must be a valid YYYY-MM-DD not in the future — TMDB release dates
// for unreleased titles (e.g. the "upcoming" category) would otherwise emit
// future dates, which Search Console flags as invalid.
const formatDate = (dateString: string | undefined) => {
  if (!dateString) return null
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return null
  const iso = date.toISOString().split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const today = new Date().toISOString().split('T')[0]
  return iso > today ? today : iso
}

function urlEntry(loc: string, lastmod?: string | null) {
  const escapedLoc = escapeXml(loc)
  return lastmod
    ? `  <url><loc>${escapedLoc}</loc><lastmod>${lastmod}</lastmod></url>`
    : `  <url><loc>${escapedLoc}</loc></url>`
}

const PAGES_PER_LIST = 2
const CREDITS_SAMPLE_SIZE = 60
const TV_CREDITS_SAMPLE_SIZE = 30

// TMDB allows ~50 req/s — one unbounded Promise.all over ~75 discovers could
// 429, rejecting the whole block and silently emitting a sitemap with no
// dynamic entries. Sequential batches keep the render under the limit.
async function runBatched<R>(tasks: (() => Promise<R>)[], size = 10): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < tasks.length; i += size) {
    results.push(...await Promise.all(tasks.slice(i, i + size).map(task => task())))
  }
  return results
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  const today = new Date().toISOString().split('T')[0]
  const [generatedLists, titleChangeIndex] = await Promise.all([getGeneratedLists(), getTitleChangeIndex()])

  // Provider-diff events are real page-content changes ("leaves Netflix Oct 20")
  // and often postdate release_date — the newest wins as lastmod.
  const latestChangeDate = (tmdbType: 'movie' | 'tv', id: number): string | null => {
    const entry = titleChangeIndex?.[`${tmdbType}:${id}`]
    if (!entry) return null
    let latest: string | null = null
    for (const e of [...(entry.coming || []), ...(entry.added || []), ...(entry.left || [])]) {
      const d = formatDate(e.date)
      if (d && d > (latest || '')) latest = d
    }
    return latest
  }
  const newest = (...dates: (string | null)[]) => dates.filter(Boolean).sort().pop() || null

  // lastmod is only emitted where a real change date exists — emitting
  // "today" everywhere taught Google the field was meaningless.
  const staticEntries = [
    urlEntry(`${siteUrl}/`),
    urlEntry(`${siteUrl}/disclosure`),
    urlEntry(`${siteUrl}/about`),
    urlEntry(`${siteUrl}/privacy`),
    urlEntry(`${siteUrl}/terms`),
    urlEntry(`${siteUrl}/contact`),
    urlEntry(`${siteUrl}/streaming`),
    urlEntry(`${siteUrl}/browse`),
    urlEntry(`${siteUrl}/genre`),
    urlEntry(`${siteUrl}/streaming-in-india`),
    urlEntry(`${siteUrl}/justwatch-alternative`),
    urlEntry(`${siteUrl}/new-on-streaming`),
    urlEntry(`${siteUrl}/leaving`),
    urlEntry(`${siteUrl}/this-month`),
    urlEntry(`${siteUrl}/widgets`),
    ...Object.keys(PROVIDER_NAME_MATCH).map(provider => urlEntry(`${siteUrl}/leaving/${provider}`)),
    ...Object.keys(PROVIDER_NAME_MATCH).map(provider => urlEntry(`${siteUrl}/this-month/${provider}`)),
    urlEntry(`${siteUrl}/free`),
    urlEntry(`${siteUrl}/collections`),
    urlEntry(`${siteUrl}/lists`),
    urlEntry(`${siteUrl}/tv`),
    ...franchiseCollectionIds.map((id) => urlEntry(`${siteUrl}/collections/${id}`)),
  ]

  const listingEntries = [
    ...Object.keys(movieCategories).map(category =>
      urlEntry(`${siteUrl}/browse/${category}`)
    ),
    ...Object.keys(movieGenres).map(genre =>
      urlEntry(`${siteUrl}/genre/${genre}`)
    ),
    ...Object.keys(streamingProviders).map(provider =>
      urlEntry(`${siteUrl}/streaming/${provider}`)
    ),
    // Googlebot sends no geo headers, so it always crawls the DEFAULT_REGION
    // view — provider×genre combos for region-locked services render thin and
    // emit noindex there. Advertising them wastes crawl on URLs that can never
    // index; the pages still exist for users in-region.
    ...getProviderGenreTargets()
      .filter(({ providerKey }) => isProviderAvailableInRegion(providerKey, DEFAULT_REGION))
      .map(({ providerKey, genreKey }) =>
        urlEntry(`${siteUrl}/streaming/${providerKey}/${genreKey}`)
      ),
    ...Object.keys(tvCategories).map(category =>
      urlEntry(`${siteUrl}/tv/browse/${category}`)
    ),
    ...Object.keys(tvGenres).map(genre =>
      urlEntry(`${siteUrl}/tv/genre/${genre}`)
    ),
    ...Object.keys(streamingProviders).map(provider =>
      urlEntry(`${siteUrl}/tv/streaming/${provider}`)
    ),
    ...getTvProviderGenreTargets()
      .filter(({ providerKey }) => isProviderAvailableInRegion(providerKey, DEFAULT_REGION))
      .map(({ providerKey, genreKey }) =>
        urlEntry(`${siteUrl}/tv/streaming/${providerKey}/${genreKey}`)
      ),
    ...Object.keys(curatedLists).map(slug =>
      urlEntry(`${siteUrl}/lists/${slug}`)
    ),
    ...Object.entries(generatedLists).map(([slug, list]) =>
      urlEntry(`${siteUrl}/lists/${slug}`, list.createdAt ? formatDate(new Date(list.createdAt).toISOString()) : null)
    ),
  ]

  const movieEntries = new Map<number, string>()
  const showEntries = new Map<number, string>()
  const personIds = new Set<number>()
  const companyIds = new Set<number>()
  const networkIds = new Set<number>()

  try {
    const pageRange = Array.from({ length: PAGES_PER_LIST }, (_, i) => i + 1)
    const categories = Object.keys(movieCategories)
    const categoryResults = await runBatched(
      categories.flatMap(category =>
        pageRange.map(page => () => fetchDiscoverMovies({ category, page }))
      )
    )

    const genreResults = await runBatched(
      Object.values(movieGenres).flatMap(genre =>
        pageRange.map(page => () => fetchDiscoverMovies({ genreId: genre.id, page }))
      )
    )

    const tvCategoryResults = await runBatched(
      Object.keys(tvCategories).flatMap(category =>
        pageRange.map(page => () => fetchDiscoverTv({ category, page }))
      )
    )

    const tvGenreResults = await runBatched(
      Object.values(tvGenres).flatMap(genre =>
        pageRange.map(page => () => fetchDiscoverTv({ genreId: genre.id, page }))
      )
    )

    // Discover samples can miss spiking titles — merge the trending-week set so
    // the highest-demand pages always carry a sitemap entry.
    const [trendingMovies, trendingTv] = await Promise.all([
      fetchTmdb<TmdbPaged<TmdbMovie>>('/trending/movie/week', { page: 1 }).catch((): null => null),
      fetchTmdb<TmdbPaged<TmdbTvShow>>('/trending/tv/week', { page: 1 }).catch((): null => null)
    ])

    const allMovies = [
      ...categoryResults.flatMap(d => d?.results || []),
      ...genreResults.flatMap(d => d?.results || []),
      ...(trendingMovies?.results || []),
    ]

    const allShows = [
      ...tvCategoryResults.flatMap(d => d?.results || []),
      ...tvGenreResults.flatMap(d => d?.results || []),
      ...(trendingTv?.results || []).map(s => ({ ...s, title: s.name, release_date: s.first_air_date, mediaType: 'tv' as const })),
    ]

    for (const movie of allMovies) {
      // Detail pages noindex titles without an overview — keep them out of
      // the sitemap (the discover payload already carries the field).
      if (!movie?.id || !movie.overview) continue
      if (!movieEntries.has(movie.id)) {
        const lastmod = newest(formatDate(movie.release_date), latestChangeDate('movie', movie.id)) || today
        movieEntries.set(movie.id, lastmod)
      }
    }

    for (const show of allShows) {
      if (!show?.id || !show.overview) continue
      if (!showEntries.has(show.id)) {
        const lastmod = newest(formatDate(show.first_air_date || show.release_date), latestChangeDate('tv', show.id)) || today
        showEntries.set(show.id, lastmod)
      }
    }

    const creditsSampleMovies = Array.from(movieEntries.keys())
      .slice(0, CREDITS_SAMPLE_SIZE)
      .map(id => allMovies.find(movie => movie.id === id))
      .filter((movie): movie is (typeof allMovies)[number] => Boolean(movie))
    const detailResults = await runBatched(
      creditsSampleMovies.map(movie => () =>
        fetchTmdb<TmdbMovieDetails & { credits?: Credits }>(`/movie/${movie.id}`, { append_to_response: 'credits' })
          .catch((): null => null)
      )
    )

    const KEY_CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Story', 'Producer'])

    for (const result of detailResults) {
      if (!result) continue
      const { credits, production_companies = [] } = result
      const { cast = [], crew = [] } = credits || {}
      const keyCrew = crew.filter(person => KEY_CREW_JOBS.has(person.job))

      for (const person of [...cast.slice(0, 10), ...keyCrew]) {
        if (person?.id) personIds.add(person.id)
      }
      for (const company of production_companies) {
        if (company?.id) companyIds.add(company.id)
      }
    }

    const creditsSampleShows = Array.from(showEntries.keys())
      .slice(0, TV_CREDITS_SAMPLE_SIZE)
      .map(id => allShows.find(show => show.id === id))
      .filter((show): show is (typeof allShows)[number] => Boolean(show))
    const tvDetailResults = await runBatched(
      creditsSampleShows.map(show => () =>
        fetchTmdb<TmdbTvDetails & { aggregate_credits?: AggregateCredits }>(`/tv/${show.id}`, { append_to_response: 'aggregate_credits' })
          .catch((): null => null)
      )
    )

    for (const result of tvDetailResults) {
      if (!result) continue
      const { aggregate_credits, networks = [], created_by = [] } = result
      const { cast = [] } = aggregate_credits || {}

      for (const person of [...cast.slice(0, 10), ...created_by]) {
        if (person?.id) personIds.add(person.id)
      }
      for (const network of networks) {
        if (network?.id) networkIds.add(network.id)
      }
    }
  } catch (error) {
    console.error('Error fetching data for sitemap:', error)
  }

  const dynamicMovieEntries = Array.from(movieEntries, ([id, lastmod]) =>
    urlEntry(`${siteUrl}/movies/${id}`, lastmod)
  )

  const dynamicShowEntries = Array.from(showEntries, ([id, lastmod]) =>
    urlEntry(`${siteUrl}/tv/${id}`, lastmod)
  )

  const dynamicPersonEntries = Array.from(personIds, id =>
    urlEntry(`${siteUrl}/person/${id}`)
  )

  const dynamicCompanyEntries = Array.from(companyIds, id =>
    urlEntry(`${siteUrl}/company/${id}`)
  )

  const dynamicNetworkEntries = Array.from(networkIds, id =>
    urlEntry(`${siteUrl}/network/${id}`)
  )

  const allEntries = [
    ...staticEntries,
    ...listingEntries,
    ...dynamicMovieEntries,
    ...dynamicShowEntries,
    ...dynamicPersonEntries,
    ...dynamicCompanyEntries,
    ...dynamicNetworkEntries,
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries.join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml')
  setSwrCache(res, 86400, 604800)
  res.statusCode = 200
  res.end(xml)

  return { props: {} }
}

export default function Sitemap() {
  return null
}
