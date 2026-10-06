import type { GetServerSideProps } from 'next'
import { useState } from 'react'
import { Flex, Badge, Heading, Text, Box } from '@chakra-ui/react';
import DetailPageShell from '../../components/DetailPageShell'
import DetailPoster from '../../components/DetailPoster'
import DetailHead from '../../components/DetailHead'
import DetailErrorView from '../../components/DetailErrorView'
import DetailMetaItem from '../../components/DetailMetaItem'
import DetailActions from '../../components/DetailActions'
import GenreBadges from '../../components/GenreBadges'
import CompanyLogoLink from '../../components/CompanyLogoLink'
import VoteScore from '../../components/VoteScore'
import { DetailCreditLine, DetailCreditLink } from '../../components/DetailCredit'
import RatingWidget from '../../components/RatingWidget'
import WatchProviders from '../../components/WatchProviders'
import SimilarMovies from '../../components/SimilarMovies'
import GalaxyBotTake from '../../components/GalaxyBotTake'
import CastSection from '../../components/CastSection'
import dateFormatter from '../../utils/dateFormatter'
import { getFirstPlayableKey } from '../../utils/youtubeCache'
import { detectRegion } from '../../utils/region'
import { useUserData } from '../../hooks/useUserData'
import { getProviderId, normalizeTvTitle } from '../../utils/tmdb'
import { getOrGenerateMovieReview } from '../../utils/movieReview'
import { getOrGenerateSimilarMovies } from '../../utils/similarMovies'
import { isBot } from '../../utils/rateLimiter'
import { getProviderAffiliateLinks } from '../../utils/takeads'
import { withTimeout } from '../../utils/withTimeout'
import { absoluteImageUrl, aggregateRatingSchema, buildOgImageUrl, personSchema } from '../../utils/schema'
import type { SimilarTitle } from '../../utils/similarMovies'
import type {
  AggregateCastMember,
  AggregateCredits,
  ContentRatingsResponse,
  TmdbPaged,
  TmdbTvDetails,
  TmdbTvShow,
  WatchProvidersRegion,
  WatchProvidersResponse
} from '../../types/tmdb'
import { LuCalendar, LuClock } from 'react-icons/lu';

type TvShowPageProps = {
  show: TmdbTvDetails
  videoKey: string | null
  watchProviders: WatchProvidersRegion | null
  watchProvidersByRegion: Record<string, WatchProvidersRegion>
  detectedRegion: string
  creators: { id: number; name: string }[]
  topCast: AggregateCastMember[]
  ageRating: string
  aiSynopsis: string | null
  similarShows: SimilarTitle[]
  providerAffiliateLinks: Record<string, string | null>
}

type Props =
  | { showError: string }
  | TvShowPageProps

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const { showId } = context.query

  if (!/^\d{1,10}$/.test(String(showId))) return { notFound: true }

  try {
    const [showRes, providersRes, creditsRes, contentRatingsRes, recommendationsRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/tv/${showId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=videos`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/aggregate_credits?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/content_ratings?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/recommendations?api_key=${process.env.TMDB_API_KEY}`)
    ])

    if (!showRes.ok) {
      if (showRes.status === 404) return { notFound: true }
      return {
        props: {
          showError: showRes.status === 401
            ? 'Show data is unavailable because the configured TMDB API key was rejected.'
            : 'Show data is temporarily unavailable. Please try again later.'
        }
      }
    }

    const showData: TmdbTvDetails = await showRes.json()
    const providersData: WatchProvidersResponse = await providersRes.json()
    const creditsData: AggregateCredits = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] }
    const contentRatingsData: ContentRatingsResponse = contentRatingsRes.ok ? await contentRatingsRes.json() : { results: [] }
    const usRating = contentRatingsData.results?.find((r) => r.iso_3166_1 === 'US')
    const cert = usRating?.rating || 'NR'
    const countryCode = detectRegion(context.req)
    const userProviders = providersData.results?.[countryCode] || providersData.results?.US || Object.values(providersData.results || {})[0] || null
    const creators = (showData.created_by || []).map((person) => ({ id: person.id, name: person.name }))
    const topCast = creditsData.cast?.slice(0, 15) || []

    const providerNames = (['flatrate', 'rent', 'buy'] as const)
      .flatMap((key) => (userProviders?.[key] || []).map((p) => p.provider_name))

    const recommendationsData: Partial<TmdbPaged<TmdbTvShow>> = recommendationsRes.ok ? await recommendationsRes.json() : { results: [] }
    const recommendationCandidates = (recommendationsData.results || [])
      .filter((candidate) => candidate?.id && candidate.poster_path && candidate.id !== showData.id)
      .map(normalizeTvTitle)

    const showGenres = showData.genres?.map((g) => g.name) || []

    // Bots still get already-cached content but never trigger generation;
    // their renders aren't CDN-cached, so an AI-less page can't be served to
    // humans/Googlebot.
    const skipAi = isBot(context.req.headers['user-agent'])

    const [validVideoKey, aiSynopsis, similarShows, providerAffiliateLinks] = await Promise.all([
      withTimeout(getFirstPlayableKey(showData.videos?.results), 3000, null),
      showData.overview
        ? withTimeout(getOrGenerateMovieReview({
            movieId: showData.id,
            title: showData.name,
            overview: showData.overview,
            genres: showGenres,
            mediaType: 'tv',
            generate: !skipAi
          }), 4500, null)
        : null,
      recommendationCandidates.length > 0
        ? withTimeout(getOrGenerateSimilarMovies({
            movieId: showData.id,
            title: showData.name,
            overview: showData.overview,
            genres: showGenres,
            candidates: recommendationCandidates,
            mediaType: 'tv',
            generate: !skipAi
          }), 4500, [])
        : [],
      getProviderAffiliateLinks(providerNames)
    ])

    if (context.res) {
      context.res.setHeader(
        'Cache-Control',
        skipAi ? 'private, no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400'
      )
    }

    return {
      props: {
        show: showData,
        videoKey: validVideoKey || null,
        watchProviders: userProviders,
        watchProvidersByRegion: providersData.results || {},
        detectedRegion: countryCode,
        creators,
        topCast,
        ageRating: cert,
        aiSynopsis: aiSynopsis || null,
        similarShows: similarShows || [],
        providerAffiliateLinks
      }
    }
  } catch (error) {
    console.error(error)
    return {
      props: {
        showError: 'Show data is temporarily unavailable. Please try again later.'
      }
    }
  }
}

export default function TvShow(props: Props) {
  if ('showError' in props) {
    return <TvShowErrorView message={props.showError} />
  }
  return <TvShowContent {...props} />
}

function TvShowErrorView({ message }: { message: string }) {
  return <DetailErrorView title='Show unavailable' message={message} />
}

function TvShowContent({ show, videoKey, watchProviders, watchProvidersByRegion, detectedRegion, creators, topCast, ageRating, aiSynopsis, similarShows, providerAffiliateLinks }: TvShowPageProps) {
  const backdropPath = show.backdrop_path || null
  const posterPath = show.poster_path || null
  const posterUrl = posterPath
    ? `https://image.tmdb.org/t/p/w500${posterPath}`
    : '/poster_fallback.webp'
  const [backdropSrc, setBackdropSrc] = useState(backdropPath || '/backdrop_fallback.webp')
  const [posterSrc, setPosterSrc] = useState(posterPath || '/poster_fallback.webp')
  const [prevPaths, setPrevPaths] = useState([backdropPath, posterPath])

  // Reset to the new prop paths on client-side nav between titles — prev-check
  // setState-during-render replaces a reset effect (react-hooks/set-state-in-effect).
  if (prevPaths[0] !== backdropPath || prevPaths[1] !== posterPath) {
    setPrevPaths([backdropPath, posterPath])
    setBackdropSrc(backdropPath || '/backdrop_fallback.webp')
    setPosterSrc(posterPath || '/poster_fallback.webp')
  }

  const { services } = useUserData()
  const myProviderIds = new Set(
    services.providers.map((key) => getProviderId(key, services.region)).filter((id): id is number => Boolean(id))
  )
  const network = show.networks?.find((n) => n.logo_path)
  const listItem = normalizeTvTitle(show)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/tv/${show.id}`
  const description = show.overview || `Where to watch ${show.name}.`
  const genres = show.genres?.map(g => g.name) || []
  const ogPoster = show.poster_path
  const ogSubtitle = description
  const ogImage = buildOgImageUrl({ siteUrl, title: show.name, subtitle: ogSubtitle, posterPath: ogPoster })

  const seasonsLabel = show.number_of_seasons
    ? `${show.number_of_seasons} season${show.number_of_seasons === 1 ? '' : 's'}`
    : null
  const episodeRuntime = show.episode_run_time?.find((mins) => mins > 0)

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: show.name,
    description,
    inLanguage: show.original_language || 'en',
    image: absoluteImageUrl(posterUrl, siteUrl),
    startDate: show.first_air_date || undefined,
    endDate: show.status === 'Ended' || show.status === 'Canceled' ? (show.last_air_date || undefined) : undefined,
    genre: genres.length > 0 ? genres : undefined,
    numberOfSeasons: show.number_of_seasons || undefined,
    numberOfEpisodes: show.number_of_episodes || undefined,
    creator: creators.length > 0 ? creators.map((person) => personSchema(person, siteUrl)) : undefined,
    actor: topCast.length > 0 ? topCast.slice(0, 5).map(person => personSchema(person, siteUrl)) : undefined,
    aggregateRating: aggregateRatingSchema(show.vote_average, show.vote_count),
    contentRating: ageRating || undefined
  }

  const trailer = videoKey
    ? { title: show.name, uploadDate: show.first_air_date || undefined, thumbnailUrl: absoluteImageUrl(posterUrl, siteUrl), videoKey }
    : null

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'TV Shows', url: `${siteUrl}/tv` },
    { name: show.name, url: canonicalUrl }
  ]

  return (
    <>
      <DetailHead
        pageTitle={`${show.name} (TV Series) | Galaxy Movies`}
        description={description}
        canonicalUrl={canonicalUrl}
        ogType='video.tv_show'
        ogImage={ogImage}
        structuredData={structuredData}
        trailer={trailer}
        breadcrumbItems={breadcrumbItems}
      />
      <DetailPageShell
        backdropSrc={backdropSrc}
        backdropAlt={show.name || 'Show Backdrop'}
        onBackdropError={() => setBackdropSrc('/backdrop_fallback.webp')}
        sidebar={
          <>
            <DetailPoster
              src={posterSrc}
              alt={show.name || 'Show Poster'}
              onError={() => setPosterSrc('/poster_fallback.webp')}
            />

            <GenreBadges genres={show.genres} />

            <Box w='20rem' maxH='300px'>
              <WatchProviders
                watchProviders={watchProviders}
                allWatchProviders={watchProvidersByRegion}
                detectedRegion={detectedRegion}
                movieTitle={show.name}
                affiliateLinks={providerAffiliateLinks}
                myProviderIds={myProviderIds}
                tmdbId={show.id}
                mediaType='tv'
                releaseYear={Number((show.first_air_date || '').slice(0, 4)) || null}
              />
            </Box>
          </>
        }
      >
            <Box>
              <Flex align='center' justify={{ base: 'center', md: 'flex-start' }} gap={4} wrap='wrap'>
                <Heading color='white' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                  <Text as='span' display='inline-block'>{show.name}</Text>
                </Heading>
                <Badge colorPalette='whiteAlpha' bg='rgba(255,255,255,0.1)' color='white' px={2.5} py={1} borderRadius='md' fontSize='xs' border='1px solid' borderColor='whiteAlpha.300' flexShrink={0}>
                  {ageRating}
                </Badge>
                {show.status && (
                  <Badge colorPalette={show.status === 'Returning Series' ? 'green' : 'gray'} px={2.5} py={1} borderRadius='md' fontSize='xs' flexShrink={0}>
                    {show.status}
                  </Badge>
                )}
              </Flex>
              {creators.length > 0 && (
                <DetailCreditLine>
                  Created by{' '}
                  {creators.map((person, index) => (
                    <span key={person.id}>
                      {index > 0 && ', '}
                      <DetailCreditLink href={`/person/${person.id}`}>{person.name}</DetailCreditLink>
                    </span>
                  ))}
                </DetailCreditLine>
              )}
            </Box>

            <Flex
              w={{ base: '100%', md: 'auto' }}
              justify={{ base: 'center', md: 'flex-start' }}
              gap={{ base: 4, md: 6 }}
              wrap='wrap'
            >
              <DetailMetaItem icon={<LuCalendar />}>
                {show.first_air_date ? dateFormatter(show.first_air_date) : 'N/A'}
              </DetailMetaItem>
              {episodeRuntime && (
                <DetailMetaItem icon={<LuClock />}>~{episodeRuntime}m/ep</DetailMetaItem>
              )}
              {seasonsLabel && (
                <DetailMetaItem>{seasonsLabel}{show.number_of_episodes ? ` · ${show.number_of_episodes} episodes` : ''}</DetailMetaItem>
              )}
            </Flex>

            <Text color='white' fontSize='md' textShadow='0 0 4px black' textAlign='left'>
              {show.overview || 'Description unavailable.'}
            </Text>

            <Flex align='center' justify='space-between' gap={{ base: 4, md: 0 }}>
              <VoteScore voteAverage={show.vote_average} />
              <Flex align='center' justify='flex-end'>
                <RatingWidget movie={listItem} />
              </Flex>
              <Flex align='center' justify='flex-end'>
                {network ? (
                  <CompanyLogoLink href={`/network/${network.id}`} company={network} />
                ) : null}
              </Flex>
            </Flex>

            <GalaxyBotTake synopsis={aiSynopsis} />

            <DetailActions videoKey={videoKey} item={listItem} />

            <CastSection cast={topCast} />

            <SimilarMovies movies={similarShows} />
      </DetailPageShell>
    </>
  );
}
