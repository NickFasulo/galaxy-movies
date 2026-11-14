import type { GetServerSidePropsContext } from 'next'
import type { TmdbMovie, TmdbTvShow, TmdbPaged } from '../types/tmdb'
import { fetchDiscoverMovies, fetchDiscoverTv, fetchTmdb, isProviderAvailableInRegion, movieCategories, movieGenres, tvCategories, tvGenres, streamingProviders, PROVIDER_NAME_MATCH } from '../features/catalog/tmdb'
import { getMonthlyChanges, getTitleChangeIndex, getCatalogSizes, IN_TRACKED_PROVIDERS } from '../features/catalog/streamingChanges'
import { DEFAULT_REGION } from '../lib/region'
import { curatedLists } from '../features/catalog/curatedLists'
import { getGeneratedLists } from '../features/catalog/generatedLists'
import { getProviderGenreTargets, getTvProviderGenreTargets, MIN_INDEXABLE_MOVIES } from '../features/catalog/contentOpportunities'
import { franchiseCollectionIds } from '../features/catalog/franchises'
import { noindexPaths } from '../lib/indexability'
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
  const [generatedLists, titleChangeIndex, monthlyChanges, inCatalogSizes, noindex] = await Promise.all([
    getGeneratedLists(),
    getTitleChangeIndex(),
    getMonthlyChanges([...Object.keys(PROVIDER_NAME_MATCH), ...IN_TRACKED_PROVIDERS.map((k) => `IN:${k}`)]),
    getCatalogSizes('IN'),
    noindexPaths()
  ])

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

  // The provider-diff pages get their real content-change date as lastmod —
  // it's the signal that moves these URLs up the crawl queue (they otherwise
  // sit at "Discovered - currently not indexed" behind the detail-page flood).
  const diffLastmod = (provider: string): string | null => {
    const updatedAt = monthlyChanges[provider]?.updatedAt
    return updatedAt ? formatDate(new Date(updatedAt).toISOString()) : null
  }
  const anyProviderLastmod = newest(...Object.keys(PROVIDER_NAME_MATCH).map(diffLastmod))
  const anyInProviderLastmod = newest(...IN_TRACKED_PROVIDERS.map((p) => diffLastmod(`IN:${p}`)))

  // /in/ listing URLs always render the IN catalog, so region-lock thinness
  // doesn't apply — but small regional services can still fall under the
  // 8-title indexability floor on genre slices (~10-25% of catalog). Gate on
  // the tracked catalog size; missing data fails open.
  const inMovieSize = (provider: string) => inCatalogSizes[provider]?.m
  const inTvSize = (provider: string) => inCatalogSizes[provider]?.t
  const IN_PROVIDER_FLOOR = MIN_INDEXABLE_MOVIES
  const IN_GENRE_FLOOR = 100
  const inProviderPageOk = (p: string) => (inMovieSize(p) ?? IN_PROVIDER_FLOOR) >= IN_PROVIDER_FLOOR
  const inGenrePageOk = (p: string) => (inMovieSize(p) ?? IN_GENRE_FLOOR) >= IN_GENRE_FLOOR
  const inTvProviderPageOk = (p: string) => (inTvSize(p) ?? IN_PROVIDER_FLOOR) >= IN_PROVIDER_FLOOR
  const inTvGenrePageOk = (p: string) => (inTvSize(p) ?? IN_GENRE_FLOOR) >= IN_GENRE_FLOOR
  // Authoritative gate: paths whose last render actually emitted noindex
  // (recorded by the page's GSSP) never enter the sitemap — the catalog-size
  // proxies above can't see thin genre slices.
  const kept = (path: string) => !noindex.has(path)

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
    urlEntry(`${siteUrl}/anime`),
    urlEntry(`${siteUrl}/streaming-in-india`),
    urlEntry(`${siteUrl}/justwatch-alternative`),
    urlEntry(`${siteUrl}/reelgood-alternative`),
    urlEntry(`${siteUrl}/trakt-alternative`),
    urlEntry(`${siteUrl}/tv-time-alternative`),
    urlEntry(`${siteUrl}/imdb-alternative`),
    urlEntry(`${siteUrl}/whats-on-netflix-alternative`),
    urlEntry(`${siteUrl}/flixable-alternative`),
    urlEntry(`${siteUrl}/instantwatcher-alternative`),
    urlEntry(`${siteUrl}/can-i-stream-it-alternative`),
    urlEntry(`${siteUrl}/letterboxd-alternative`),
    urlEntry(`${siteUrl}/compare`),
    urlEntry(`${siteUrl}/compare/filmatic`),
    urlEntry(`${siteUrl}/movie-night`),
    urlEntry(`${siteUrl}/new-on-streaming`, anyProviderLastmod),
    urlEntry(`${siteUrl}/leaving`, anyProviderLastmod),
    urlEntry(`${siteUrl}/this-month`, anyProviderLastmod),
    urlEntry(`${siteUrl}/in/new-on-streaming`, anyInProviderLastmod),
    urlEntry(`${siteUrl}/in/leaving`, anyInProviderLastmod),
    urlEntry(`${siteUrl}/in/this-month`, anyInProviderLastmod),
    urlEntry(`${siteUrl}/reports`),
    urlEntry(`${siteUrl}/reports/streaming-churn`, anyProviderLastmod),
    urlEntry(`${siteUrl}/widgets`),
    ...Object.keys(PROVIDER_NAME_MATCH).map(provider => urlEntry(`${siteUrl}/leaving/${provider}`, diffLastmod(provider))),
    ...Object.keys(PROVIDER_NAME_MATCH).map(provider => urlEntry(`${siteUrl}/this-month/${provider}`, diffLastmod(provider))),
    ...Object.keys(PROVIDER_NAME_MATCH).map(provider => urlEntry(`${siteUrl}/new-on-streaming/${provider}`, diffLastmod(provider))),
    ...IN_TRACKED_PROVIDERS.map(provider => urlEntry(`${siteUrl}/in/leaving/${provider}`, diffLastmod(`IN:${provider}`))),
    ...IN_TRACKED_PROVIDERS.map(provider => urlEntry(`${siteUrl}/in/this-month/${provider}`, diffLastmod(`IN:${provider}`))),
    ...IN_TRACKED_PROVIDERS.map(provider => urlEntry(`${siteUrl}/in/new-on-streaming/${provider}`, diffLastmod(`IN:${provider}`))),
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
    ...Object.keys(streamingProviders)
      .filter(provider => isProviderAvailableInRegion(provider, DEFAULT_REGION) && kept(`/streaming/${provider}`))
      .map(provider =>
      urlEntry(`${siteUrl}/streaming/${provider}`)
    ),
    // Googlebot sends no geo headers, so it always crawls the DEFAULT_REGION
    // view — provider×genre combos for region-locked services render thin and
    // emit noindex there. Advertising them wastes crawl on URLs that can never
    // index; the pages still exist for users in-region.
    ...getProviderGenreTargets()
      .filter(({ providerKey, genreKey }) => isProviderAvailableInRegion(providerKey, DEFAULT_REGION) && kept(`/streaming/${providerKey}/${genreKey}`))
      .map(({ providerKey, genreKey }) =>
        urlEntry(`${siteUrl}/streaming/${providerKey}/${genreKey}`)
      ),
    ...Object.keys(tvCategories).map(category =>
      urlEntry(`${siteUrl}/tv/browse/${category}`)
    ),
    ...Object.keys(tvGenres).map(genre =>
      urlEntry(`${siteUrl}/tv/genre/${genre}`)
    ),
    ...Object.keys(streamingProviders)
      .filter(provider => isProviderAvailableInRegion(provider, DEFAULT_REGION) && kept(`/tv/streaming/${provider}`))
      .map(provider =>
      urlEntry(`${siteUrl}/tv/streaming/${provider}`)
    ),
    ...getTvProviderGenreTargets()
      .filter(({ providerKey, genreKey }) => isProviderAvailableInRegion(providerKey, DEFAULT_REGION) && kept(`/tv/streaming/${providerKey}/${genreKey}`))
      .map(({ providerKey, genreKey }) =>
        urlEntry(`${siteUrl}/tv/streaming/${providerKey}/${genreKey}`)
      ),
    // The /in/ space pins region=IN server-side — it's the only surface where
    // IN-only providers (JioHotstar, ZEE5, SonyLIV, …) can index at all, since
    // Googlebot always crawls the US render of the unprefixed URLs.
    ...IN_TRACKED_PROVIDERS
      .filter(p => inProviderPageOk(p) && kept(`/in/streaming/${p}`))
      .map(provider => urlEntry(`${siteUrl}/in/streaming/${provider}`)),
    ...getProviderGenreTargets()
      .filter(({ providerKey, genreKey }) => isProviderAvailableInRegion(providerKey, 'IN') && inGenrePageOk(providerKey) && kept(`/in/streaming/${providerKey}/${genreKey}`))
      .map(({ providerKey, genreKey }) =>
        urlEntry(`${siteUrl}/in/streaming/${providerKey}/${genreKey}`)
      ),
    ...IN_TRACKED_PROVIDERS
      .filter(p => inTvProviderPageOk(p) && kept(`/in/tv/streaming/${p}`))
      .map(provider => urlEntry(`${siteUrl}/in/tv/streaming/${provider}`)),
    ...getTvProviderGenreTargets()
      .filter(({ providerKey, genreKey }) => isProviderAvailableInRegion(providerKey, 'IN') && inTvGenrePageOk(providerKey) && kept(`/in/tv/streaming/${providerKey}/${genreKey}`))
      .map(({ providerKey, genreKey }) =>
        urlEntry(`${siteUrl}/in/tv/streaming/${providerKey}/${genreKey}`)
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

  try {
    const pageRange = Array.from({ length: PAGES_PER_LIST }, (_, i) => i + 1)
    const categories = Object.keys(movieCategories)
    // Release-day demand spikes on titles well below the top-40 upcoming, and
    // a page only captures it if Google indexed it before release — 'upcoming'
    // gets 4 pages (~80 titles) for that reason alone.
    const UPCOMING_PAGES = 4
    const categoryResults = await runBatched(
      categories.flatMap(category =>
        (category === 'upcoming' ? Array.from({ length: UPCOMING_PAGES }, (_, i) => i + 1) : pageRange)
          .map(page => () => fetchDiscoverMovies({ category, page }))
      )
    )

    const genreResults = await runBatched(
      Object.values(movieGenres).flatMap(genre =>
        pageRange.map(page => () => fetchDiscoverMovies({ genreId: genre.id, genreParams: genre.params, page }))
      )
    )

    const tvCategoryResults = await runBatched(
      Object.keys(tvCategories).flatMap(category =>
        pageRange.map(page => () => fetchDiscoverTv({ category, page }))
      )
    )

    const tvGenreResults = await runBatched(
      Object.values(tvGenres).flatMap(genre =>
        pageRange.map(page => () => fetchDiscoverTv({ genreId: genre.id, genreParams: genre.params, page }))
      )
    )

    // Global popularity buries major regional releases below the 'upcoming'
    // cutoff (Jailer 2's spike nearly missed it) — region-scoped slices
    // guarantee the big US and IN titles always enter the sitemap pre-release.
    const upcomingRegions = await runBatched(
      (['US', 'IN'] as const).map(region => () =>
        fetchTmdb<TmdbPaged<TmdbMovie>>('/discover/movie', {
          page: 1,
          include_adult: 'false',
          sort_by: 'popularity.desc',
          region,
          'release_date.gte': today,
          'vote_count.gte': 10
        }).catch((): null => null)
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
      ...upcomingRegions.flatMap(d => d?.results || []),
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
  } catch (error) {
    console.error('Error fetching data for sitemap:', error)
  }

  const dynamicMovieEntries = Array.from(movieEntries, ([id, lastmod]) =>
    urlEntry(`${siteUrl}/movies/${id}`, lastmod)
  )

  const dynamicShowEntries = Array.from(showEntries, ([id, lastmod]) =>
    urlEntry(`${siteUrl}/tv/${id}`, lastmod)
  )

  // person/company/network URLs are deliberately absent: they were 42% of the
  // sitemap yet ~1.5% of search clicks, and their queue presence starved the
  // provider-diff pages Google never crawled. The pages still exist for users
  // via internal links — they're just no longer submitted for crawl.
  const allEntries = [
    ...staticEntries,
    ...listingEntries,
    ...dynamicMovieEntries,
    ...dynamicShowEntries,
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
