import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { Badge, Box, Button, Flex, Heading, Text } from '@chakra-ui/react';
import SearchBar from '../components/SearchBar'
import ScrollTopButton from '../components/ScrollTopButton'
import { InfiniteTitleGrid, usePaginatedFeed, type FeedPage } from '../components/PaginatedGrid'
import Wordmark from '../components/Wordmark'
import HoverBackground, { useHoverBackground } from '../components/HoverBackground'
import HomeHero from '../components/HomeHero'
import ProviderBar from '../components/ProviderBar'
import TitleRail from '../components/TitleRail'
import CardProviderIcons from '../components/CardProviderIcons'
import PageHead from '../components/PageHead'
import { useStreamingBadges } from '../hooks/useStreamingBadges'
import { useProviderCatalog } from '../hooks/useProviderCatalog'
import { useUserData } from '../hooks/useUserData'
import { fetchDiscoverMovies, fetchListMovies, fetchTmdb, getProviderIds, isProviderAvailableInRegion, streamingProviders } from '../utils/tmdb'
import { getProviderCatalog } from '../utils/providerCatalog'
import { detectRegion } from '../utils/region'
import { ratingEntries, setServices } from '../utils/userData'
import { setSwrCache } from '../utils/ssr'
import { SITE_URL } from '../utils/site'
import type { TitleSummary, TmdbMovie, TmdbPaged, WatchProvider, WatchProvidersResponse } from '../types/tmdb'

interface Props {
  initialMovies: TmdbMovie[]
  initialTotalPages: number
  region: string
  featured: TitleSummary | null
  featuredProviders: WatchProvider[]
  providerCatalog: WatchProvider[]
  trendingRail: TitleSummary[]
  newOn: { providerKey: string; providerLabel: string; movies: TmdbMovie[] }
}

const nowStreamingBadge = (
  <Badge colorPalette='green' fontSize='2xs' px={1.5} py={0.5} borderRadius='md'>
    Now streaming
  </Badge>
)

// Feed values that route to non-movie TMDB media via the `media` query param.
const MEDIA_FOR_CATEGORY: Record<string, string> = { tv: 'tv', trending: 'trending' }

type TrendingItem = TitleSummary & { media_type?: string }

// Same 45-day "recently released" window as the /new-on-streaming page.
const NEW_ON_WINDOW_DAYS = 45
const RAIL_SIZE = 12

export async function getServerSideProps({ req, res, query }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const region = detectRegion(req)
  // /?search=… stays a valid entry (old links, schema SearchAction history) —
  // the dedicated /search page owns results now, so forward before spending
  // any TMDB calls on a homepage payload the user will never see.
  const searchTerm = typeof query.search === 'string' ? query.search.trim() : ''
  if (searchTerm) {
    return { redirect: { destination: `/search?q=${encodeURIComponent(searchTerm)}`, permanent: false } }
  }
  // Registry order = display order; the first provider available in the region
  // anchors the "New on …" rail (Netflix in US/IN).
  const railProviderKey = Object.keys(streamingProviders).find((key) => isProviderAvailableInRegion(key, region)) || 'netflix'
  const railProviderIds = getProviderIds(railProviderKey, region)

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - NEW_ON_WINDOW_DAYS)

  const [popularData, trendingData, catalog, newOnData] = await Promise.all([
    fetchDiscoverMovies({ category: 'popular', page: 1 }).catch(() => null),
    fetchTmdb<TmdbPaged<TrendingItem>>('/trending/all/week', { page: 1 }).catch(() => null),
    getProviderCatalog(region).catch(() => [] as WatchProvider[]),
    railProviderIds.length
      ? fetchListMovies({
          'primary_release_date.gte': windowStart.toISOString().split('T')[0],
          'primary_release_date.lte': new Date().toISOString().split('T')[0],
          sort_by: 'primary_release_date.desc',
          with_watch_providers: railProviderIds.join('|'),
          watch_region: region
        }).catch(() => null)
      : Promise.resolve(null)
  ])

  const trendingItems: TitleSummary[] = (trendingData?.results || [])
    .filter((item) => item?.poster_path && (item.media_type === 'movie' || item.media_type === 'tv'))
    .map((item) => item.media_type === 'tv'
      ? { ...item, title: item.name, release_date: item.first_air_date, mediaType: 'tv' as const }
      : { ...item, mediaType: 'movie' as const })

  const featured = trendingItems.find((item) => item.backdrop_path) || null

  let featuredProviders: WatchProvider[] = []
  if (featured) {
    const mediaType = featured.mediaType === 'tv' ? 'tv' : 'movie'
    featuredProviders = await fetchTmdb<WatchProvidersResponse>(`/${mediaType}/${featured.id}/watch/providers`)
      .then((data) => data.results?.[region]?.flatrate || [])
      .catch(() => [])
  }

  setSwrCache(res, 21600, 86400)
  return {
    props: {
      region,
      initialMovies: popularData?.results || [],
      initialTotalPages: popularData?.total_pages || 1,
      featured,
      featuredProviders,
      providerCatalog: catalog,
      trendingRail: trendingItems
        .filter((item) => item.id !== featured?.id || item.mediaType !== featured?.mediaType)
        .slice(0, RAIL_SIZE),
      newOn: {
        providerKey: railProviderKey,
        providerLabel: streamingProviders[railProviderKey]?.title.replace(' Movies', '') || railProviderKey,
        movies: (newOnData?.results || []).slice(0, RAIL_SIZE)
      }
    }
  }
}

export default function Home({ initialMovies, initialTotalPages, region, featured, featuredProviders, providerCatalog, trendingRail, newOn }: Props) {
  const router = useRouter()
  const [category, setCategory] = useState('popular')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const lastFetchTimeRef = useRef(0)
  const isRestoredRef = useRef(false)
  const { hoveredBg, isBgVisible, handleCardMouseEnter, handleCardMouseLeave } = useHoverBackground()
  const { services, ratings } = useUserData()
  const [tastePicks, setTastePicks] = useState<{ sourceTitle: string; sourceRating: number; movies: TitleSummary[] } | null>(null)
  const catalogMap = useProviderCatalog(services.region, services.region === region ? providerCatalog : undefined)

  useEffect(() => {
    const savedCategory = localStorage.getItem('category')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time localStorage hydrate; a lazy initializer would mismatch SSR HTML
    if (savedCategory) setCategory(savedCategory)

    const savedSearch = sessionStorage.getItem('homeSearchInput')
    if (savedSearch) {
      setSearchInput(savedSearch)
      setDebouncedSearch(savedSearch.trim())
    }
  }, [])

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400)
    return () => clearTimeout(handler)
  }, [searchInput])

  // Personalized rail off the strongest self-rating — post-mount only, so SSR
  // output stays identical for everyone.
  useEffect(() => {
    const top = ratingEntries(ratings)
      .filter((r) => r.rating >= 8)
      .sort((a, b) => b.rating - a.rating)[0]
    if (!top) return
    let cancelled = false
    fetch(`/api/recommendations?mediaType=${top.mediaType}&id=${top.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.results) && d.results.length) {
          setTastePicks({ sourceTitle: top.title, sourceRating: top.rating, movies: d.results })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ratings])

  const activeSearch = debouncedSearch.length > 2 ? debouncedSearch : ''

  // TMDB search can't filter by watch provider — selected services only reach the
  // API on browse feeds; during search they're applied client-side below.
  const providerKeys = services.providers
  const feedProviders = activeSearch ? '' : providerKeys.join(',')

  const feedQueryFn = useCallback(async (page: number): Promise<FeedPage> => {
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTimeRef.current
    const MIN_FETCH_DELAY = 500

    if (timeSinceLastFetch < MIN_FETCH_DELAY) {
      await new Promise(resolve => setTimeout(resolve, MIN_FETCH_DELAY - timeSinceLastFetch))
    }

    lastFetchTimeRef.current = Date.now()

    const media = MEDIA_FOR_CATEGORY[category]
    const mediaParam = media ? `&media=${media}` : ''
    const providersParam = feedProviders ? `&providers=${encodeURIComponent(feedProviders)}&region=${encodeURIComponent(services.region)}` : ''
    const url = activeSearch
      ? `/api/allMovies?search=${encodeURIComponent(activeSearch)}&page=${page}${mediaParam}`
      : media
        ? `/api/allMovies?media=${media}&page=${page}${providersParam}`
        : `/api/allMovies?category=${category}&page=${page}${providersParam}`

    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to load movies')
    return res.json()
  }, [category, activeSearch, feedProviders, services.region])

  const feed = usePaginatedFeed({
    queryKey: ['infiniteMovies', category, activeSearch, feedProviders, services.region],
    queryFn: feedQueryFn,
    initialTitles: (category === 'popular' && !activeSearch && !feedProviders) ? initialMovies : undefined,
    initialTotalPages
  })

  const moviesList = feed.titles

  const changeCategory = useCallback((selectedCategory: string) => {
    setCategory(selectedCategory)
    localStorage.setItem('category', selectedCategory)
    isRestoredRef.current = true
    sessionStorage.removeItem('homeScrollPos')
    lastFetchTimeRef.current = 0
  }, [])

  // Rails share the badge/icon lookups — one extra chunk of ids at most.
  const badgeTitles = useMemo(() => [...moviesList, ...trendingRail, ...newOn.movies], [moviesList, trendingRail, newOn.movies])
  const { isStreaming, providersFor, myProviderIds, isReady: providersReady } = useStreamingBadges(badgeTitles)

  // Provider-filtered search results wait for the badge lookups to land —
  // hiding on an empty providersFor would flash an empty grid first.
  const filterForServices = useCallback((list: TitleSummary[]) =>
    activeSearch && myProviderIds.size > 0 && providersReady
      ? list.filter((movie) => providersFor(movie).some((id) => myProviderIds.has(id)))
      : list,
  [activeSearch, myProviderIds, providersReady, providersFor])

  const clearServices = useCallback(() => setServices(services.region, []), [services.region])

  const badgeFor = (movie: TitleSummary): ReactNode => {
    const providers = providersFor(movie)
      .map((id) => catalogMap?.get(id))
      .filter((p): p is WatchProvider => Boolean(p))
    if (providers.length > 0) return <CardProviderIcons providers={providers} myProviderIds={myProviderIds} />
    return isStreaming(movie) ? nowStreamingBadge : null
  }

  useEffect(() => {
    const handleRouteChange = () => {
      sessionStorage.setItem('homeScrollPos', window.scrollY.toString())
      sessionStorage.setItem('homeSearchInput', searchInput)
    }

    router.events.on('routeChangeStart', handleRouteChange)
    return () => router.events.off('routeChangeStart', handleRouteChange)
  }, [router, searchInput])

  useEffect(() => {
    if (isRestoredRef.current) return

    const savedPos = sessionStorage.getItem('homeScrollPos')
    if (savedPos && moviesList.length > 0) {
      const targetPos = parseInt(savedPos, 10)
      const timer = setTimeout(() => {
        window.scrollTo({ top: targetPos, behavior: 'instant' })
        isRestoredRef.current = true
        sessionStorage.removeItem('homeScrollPos')
      }, 20)

      return () => clearTimeout(timer)
    }
  }, [moviesList.length])

  const pageTitle = 'Galaxy Movies – Discover Popular & New Films'
  const pageDescription = 'Discover popular movies, browse by genre, and find where to watch them. Galaxy Movies helps you explore new releases, top-rated films, and streaming options all in one place.'

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Galaxy Movies',
    url: SITE_URL,
    description: pageDescription,
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  }

  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Galaxy Movies',
    url: SITE_URL,
    description: pageDescription,
    inLanguage: 'en',
    applicationCategory: 'Entertainment',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    }
  }

  return (
    <>
      <PageHead
        title={pageTitle}
        titleSuffix={false}
        description={pageDescription}
        canonicalUrl={SITE_URL}
        ogTitle='Galaxy Movies'
        ogSubtitle='Discover Popular & New Films'
        structuredData={[websiteSchema, webApplicationSchema]}
      >
        <link rel='icon' href='/favicon.ico' />
        {/* Impact's verifier requires a `value` attribute, which React's meta typings don't include. */}
        <meta name='impact-site-verification' {...{ value: '1ad17b76-2079-4639-9f17-f65f40948c6b' }} />
        <meta name="google-adsense-account" content="ca-pub-7970999589560353" />
        <meta name="google-site-verification" content="dI9IyHQELzpq29cGmnFHM5lAXtVXJFovinLzCWl2NlM" />
        <meta name="mitgo-verification" content="dd8a3d12-ce6e-4f62-a56f-79c7a28cbb8d" />
      </PageHead>

      <HoverBackground hoveredBg={hoveredBg} isBgVisible={isBgVisible} />

      <Box position='relative' zIndex={1} h='100%' pb='4rem' color='white'>
        {!activeSearch && (
          <HomeHero
            featured={featured}
            providers={featuredProviders}
            myProviderIds={myProviderIds}
            dimmed={Boolean(isBgVisible && hoveredBg)}
          >
            <Heading as='h1' textAlign='center' mt='2rem'>
              <Wordmark fontSize={{ base: '2.5rem', md: '3.75rem' }} />
            </Heading>
            <Text textAlign='center' color='gray.400' fontSize='xs' letterSpacing='0.28em' textTransform='uppercase' mt={3} mb='1.5rem'>Warp speed movie discovery</Text>
          </HomeHero>
        )}

        <SearchBar
          category={category}
          changeCategory={changeCategory}
          searchInput={searchInput}
          setSearchInput={setSearchInput}
        />

        <ProviderBar catalog={catalogMap} />

        {providerKeys.length > 0 && (
          <Flex justify='center' mt='1.5rem' mx='1.5rem'>
            <Flex align='center' gap={3} bg='surface.raised' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='full' px={4} py={1.5}>
              <Text fontSize='xs' color='gray.300'>
                Showing {activeSearch ? 'results' : 'titles'} on your services
              </Text>
              <Button size='2xs' variant='ghost' color='gray.300' onClick={clearServices} _hover={{ color: 'white' }}>
                Clear
              </Button>
            </Flex>
          </Flex>
        )}

        {!activeSearch && (
          <>
            {tastePicks && (
              <TitleRail
                title={`Because you rated ${tastePicks.sourceTitle} ${tastePicks.sourceRating}/10`}
                movies={tastePicks.movies}
                badgeFor={badgeFor}
                onCardEnter={handleCardMouseEnter}
                onCardLeave={handleCardMouseLeave}
              />
            )}
            <TitleRail
              title='Trending this week'
              movies={trendingRail}
              badgeFor={badgeFor}
              onCardEnter={handleCardMouseEnter}
              onCardLeave={handleCardMouseLeave}
            />
            <TitleRail
              title={`New on ${newOn.providerLabel}`}
              href='/new-on-streaming'
              movies={newOn.movies}
              badgeFor={badgeFor}
              onCardEnter={handleCardMouseEnter}
              onCardLeave={handleCardMouseLeave}
            />
          </>
        )}

        <InfiniteTitleGrid
          titles={moviesList}
          hasData={Boolean(feed.data)}
          status={feed.status}
          loadedPages={feed.data?.pages.length ?? 1}
          fetchNextPage={feed.fetchNextPage}
          hasNextPage={Boolean(feed.hasNextPage)}
          isFetchingNextPage={feed.isFetchingNextPage}
          filterTitles={filterForServices}
          emptyMessage={
            providerKeys.length > 0
              ? `Nothing on your services matches${activeSearch ? ` “${debouncedSearch}”` : ' this feed'}.`
              : 'No movies found'
          }
          gridProps={{
            badgeFor,
            onCardEnter: handleCardMouseEnter,
            onCardLeave: handleCardMouseLeave,
            my: { base: '3rem', md: '5rem' },
            mx: { base: '1.5rem', md: '3rem', xl: 'auto' },
            maxW: { xl: '80rem' },
            minH: '100vh'
          }}
        />

        <ScrollTopButton />
      </Box>
    </>
  );
}