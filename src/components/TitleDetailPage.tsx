import type { GetServerSideProps } from 'next'
import { useState } from 'react'
import { Flex, Badge, Heading, Text, Box } from '@chakra-ui/react'
import DetailPageShell from './DetailPageShell'
import DetailPoster from './DetailPoster'
import PageHead from './PageHead'
import DetailErrorView from './DetailErrorView'
import DetailMetaItem from './DetailMetaItem'
import DetailActions from './DetailActions'
import GenreBadges from './GenreBadges'
import CompanyLogoLink from './CompanyLogoLink'
import VoteScore from './VoteScore'
import { DetailCreditLine, DetailCreditLink } from './DetailCredit'
import RatingWidget from './RatingWidget'
import WatchProviders from './WatchProviders'
import SimilarMovies from './SimilarMovies'
import GalaxyBotTake from './GalaxyBotTake'
import CastSection from './CastSection'
import timeFormatter from '../utils/timeFormatter'
import dateFormatter from '../utils/dateFormatter'
import { getFirstPlayableKey } from '../utils/youtubeCache'
import { detectRegion } from '../utils/region'
import { useUserData } from '../hooks/useUserData'
import { getProviderId, normalizeTvTitle } from '../utils/tmdb'
import { getOrGenerateMovieReview } from '../utils/movieReview'
import { getOrGenerateSimilarMovies, type SimilarTitle } from '../utils/similarMovies'
import { isBot } from '../utils/rateLimiter'
import { getProviderAffiliateLinks } from '../utils/takeads'
import { withTimeout } from '../utils/withTimeout'
import { setSwrCache } from '../utils/ssr'
import { absoluteImageUrl, aggregateRatingSchema, buildTrailerSchema, personSchema } from '../utils/schema'
import { tmdbImage, SITE_URL } from '../utils/site'
import type {
  AggregateCastMember,
  AggregateCredits,
  CastMember,
  ContentRatingsResponse,
  Credits,
  MediaType,
  NormalizedTvShow,
  ReleaseDatesResponse,
  TmdbMovie,
  TmdbMovieDetails,
  TmdbPaged,
  TmdbTvDetails,
  TmdbTvShow,
  WatchProvidersRegion,
  WatchProvidersResponse
} from '../types/tmdb'
import { LuCalendar, LuClock } from 'react-icons/lu'

interface PersonRef {
  id: number
  name: string
}

interface CommonProps {
  videoKey: string | null
  watchProviders: WatchProvidersRegion | null
  watchProvidersByRegion: Record<string, WatchProvidersRegion>
  detectedRegion: string
  ageRating: string
  aiSynopsis: string | null
  similarTitles: SimilarTitle[]
  providerAffiliateLinks: Record<string, string | null>
}

export type TitleDetailProps =
  | ({ media: 'movie'; title: TmdbMovieDetails; director: PersonRef | null; topCast: CastMember[] } & CommonProps)
  | ({ media: 'tv'; title: TmdbTvDetails; creators: PersonRef[]; topCast: AggregateCastMember[] } & CommonProps)
  | { media: MediaType; error: string }

export function titleDetailServerSideProps(media: MediaType): GetServerSideProps<TitleDetailProps> {
  const noun = media === 'movie' ? 'Movie' : 'Show'
  const idParam = media === 'movie' ? 'movieId' : 'showId'
  const creditsEndpoint = media === 'movie' ? 'credits' : 'aggregate_credits'
  const ratingsEndpoint = media === 'movie' ? 'release_dates' : 'content_ratings'

  return async (context) => {
    const id = String(context.query[idParam] || '')
    if (!/^\d{1,10}$/.test(id)) return { notFound: true }

    const errorProps = (error: string) => ({ props: { media, error } as TitleDetailProps })

    try {
      const apiKey = process.env.TMDB_API_KEY
      const [titleRes, providersRes, creditsRes, ratingsRes, recommendationsRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${media}/${id}?api_key=${apiKey}&append_to_response=videos`),
        fetch(`https://api.themoviedb.org/3/${media}/${id}/watch/providers?api_key=${apiKey}`),
        fetch(`https://api.themoviedb.org/3/${media}/${id}/${creditsEndpoint}?api_key=${apiKey}`),
        fetch(`https://api.themoviedb.org/3/${media}/${id}/${ratingsEndpoint}?api_key=${apiKey}`),
        fetch(`https://api.themoviedb.org/3/${media}/${id}/recommendations?api_key=${apiKey}`)
      ])

      if (!titleRes.ok) {
        if (titleRes.status === 404) return { notFound: true }
        return errorProps(titleRes.status === 401
          ? `${noun} data is unavailable because the configured TMDB API key was rejected.`
          : `${noun} data is temporarily unavailable. Please try again later.`)
      }

      const title: TmdbMovieDetails & TmdbTvDetails = await titleRes.json()
      const providersData: WatchProvidersResponse = await providersRes.json()
      const creditsData: Credits & AggregateCredits = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] }
      const ratingsData: ReleaseDatesResponse & ContentRatingsResponse = ratingsRes.ok ? await ratingsRes.json() : { results: [] }

      const usRatings = ratingsData.results?.find((r) => r.iso_3166_1 === 'US')
      const cert = media === 'movie'
        ? (usRatings as { release_dates?: { certification?: string }[] } | undefined)?.release_dates?.find((d) => d.certification)?.certification || 'NR'
        : (usRatings as { rating?: string } | undefined)?.rating || 'NR'

      const countryCode = detectRegion(context.req)
      const userProviders = providersData.results?.[countryCode] || providersData.results?.US || Object.values(providersData.results || {})[0] || null

      const directorObj = media === 'movie' ? creditsData.crew?.find((person) => person.job === 'Director') : null
      const director = directorObj ? { id: directorObj.id, name: directorObj.name } : null
      const creators = media === 'tv' ? (title.created_by || []).map((person) => ({ id: person.id, name: person.name })) : []
      const topCast = creditsData.cast?.slice(0, 15) || []

      const recommendationsData: Partial<TmdbPaged<TmdbMovie | TmdbTvShow>> = recommendationsRes.ok ? await recommendationsRes.json() : { results: [] }
      const recommendationCandidates = (recommendationsData.results || [])
        .filter((candidate) => candidate?.id && candidate.poster_path && candidate.id !== title.id)
        .map((candidate): TmdbMovie | NormalizedTvShow => (media === 'tv' ? normalizeTvTitle(candidate as TmdbTvShow) : candidate as TmdbMovie))

      // All regions + buckets: the client region switcher and "Watch free" row
      // render providers outside the detected region, and each still needs a link.
      const providerNames = Object.values(providersData.results || {}).flatMap((bucket) =>
        (['flatrate', 'free', 'ads', 'rent', 'buy'] as const)
          .flatMap((key) => bucket?.[key]?.map((p) => p.provider_name) || [])
      )

      // Bots still get already-cached content but never trigger generation;
      // AI-less bot renders stay uncached so they can't be served to
      // humans/Googlebot (see the Cache-Control branch below).
      const skipAi = isBot(context.req.headers['user-agent'])
      const displayTitle = media === 'tv' ? title.name : title.title
      const genres = title.genres?.map((g) => g.name) || []

      const [validVideoKey, aiSynopsis, similarTitles, providerAffiliateLinks] = await Promise.all([
        withTimeout(getFirstPlayableKey(title.videos?.results), 3000, null),
        title.overview
          ? withTimeout(getOrGenerateMovieReview({
              movieId: title.id,
              title: displayTitle,
              overview: title.overview,
              genres,
              mediaType: media,
              generate: !skipAi
            }), 4500, null)
          : null,
        recommendationCandidates.length > 0
          ? withTimeout(getOrGenerateSimilarMovies({
              movieId: title.id,
              title: displayTitle,
              overview: title.overview,
              genres,
              candidates: recommendationCandidates,
              mediaType: media,
              generate: !skipAi
            }), 4500, [])
          : [],
        getProviderAffiliateLinks(providerNames)
      ])

      // Bot renders skip AI generation, so a page whose generated slots came
      // back empty differs from the human version — keep those out of the
      // shared CDN cache. When both slots are already filled the bot render is
      // identical to a human's, and caching it lets the edge absorb repeat
      // scraper crawls instead of paying SSR + Redis + TMDB for every hit.
      const aiContentComplete =
        (title.overview ? aiSynopsis !== null : true) &&
        (recommendationCandidates.length > 0 ? similarTitles.length > 0 : true)
      if (context.res) {
        if (skipAi && !aiContentComplete) context.res.setHeader('Cache-Control', 'private, no-store')
        else setSwrCache(context.res)
      }

      const common: CommonProps = {
        videoKey: validVideoKey || null,
        watchProviders: userProviders,
        watchProvidersByRegion: providersData.results || {},
        detectedRegion: countryCode,
        ageRating: cert,
        aiSynopsis: aiSynopsis || null,
        similarTitles: similarTitles || [],
        providerAffiliateLinks
      }

      return media === 'movie'
        ? { props: { ...common, media, title, director, topCast: topCast as CastMember[] } }
        : { props: { ...common, media, title, creators, topCast: topCast as AggregateCastMember[] } }
    } catch (error) {
      console.error(error)
      return errorProps(`${noun} data is temporarily unavailable. Please try again later.`)
    }
  }
}

export default function TitleDetailPage(props: TitleDetailProps) {
  if ('error' in props) {
    return <DetailErrorView title={`${props.media === 'tv' ? 'Show' : 'Movie'} unavailable`} message={props.error} />
  }
  return <TitleDetailContent {...props} />
}

function TitleDetailContent(props: Exclude<TitleDetailProps, { error: string }>) {
  const { media, title } = props
  const isTv = media === 'tv'
  const { videoKey, watchProviders, watchProvidersByRegion, detectedRegion, ageRating, aiSynopsis, similarTitles, providerAffiliateLinks, topCast } = props

  const displayTitle = isTv ? (title as TmdbTvDetails).name : (title as TmdbMovieDetails).title
  const releaseDate = isTv ? (title as TmdbTvDetails).first_air_date : (title as TmdbMovieDetails).release_date
  const runtime = !isTv ? (title as TmdbMovieDetails).runtime : null
  const tagline = !isTv ? (title as TmdbMovieDetails).tagline : null
  const collection = !isTv ? (title as TmdbMovieDetails).belongs_to_collection : null
  const status = isTv ? (title as TmdbTvDetails).status : undefined
  const seasons = isTv ? (title as TmdbTvDetails).number_of_seasons : null
  const episodes = isTv ? (title as TmdbTvDetails).number_of_episodes : null
  const episodeRuntime = isTv ? (title as TmdbTvDetails).episode_run_time?.find((mins) => mins > 0) : undefined
  const seasonsLabel = seasons ? `${seasons} season${seasons === 1 ? '' : 's'}` : null
  const director = !isTv ? props.director : null
  const creators = isTv ? props.creators : []
  const logoOrg = isTv
    ? (title as TmdbTvDetails).networks?.find((n) => n.logo_path)
    : (title as TmdbMovieDetails).production_companies?.find((c) => c.logo_path)
  const listItem = isTv ? normalizeTvTitle(title as TmdbTvDetails) : (title as TmdbMovieDetails)

  const backdropPath = title.backdrop_path || null
  const posterPath = title.poster_path || null
  const posterUrl = tmdbImage(posterPath) || '/poster_fallback.webp'
  const [posterSrc, setPosterSrc] = useState(posterPath || '/poster_fallback.webp')
  const [prevPosterPath, setPrevPosterPath] = useState(posterPath)

  // Reset to the new prop path on client-side nav between titles — prev-check
  // setState-during-render replaces a reset effect (react-hooks/set-state-in-effect).
  if (prevPosterPath !== posterPath) {
    setPrevPosterPath(posterPath)
    setPosterSrc(posterPath || '/poster_fallback.webp')
  }

  const { services } = useUserData()
  const myProviderIds = new Set(
    services.providers.map((key) => getProviderId(key, services.region)).filter((id): id is number => Boolean(id))
  )

  const canonicalUrl = `${SITE_URL}/${isTv ? 'tv' : 'movies'}/${title.id}`
  const description = title.overview || `Where to watch ${displayTitle}.`
  const genres = title.genres?.map((g) => g.name) || []
  const ogSubtitle = (!isTv && tagline) || description
  const releaseYear = Number((releaseDate || '').slice(0, 4)) || null

  const structuredData: Record<string, unknown> = isTv
    ? {
        '@context': 'https://schema.org',
        '@type': 'TVSeries',
        name: displayTitle,
        description,
        inLanguage: title.original_language || 'en',
        image: absoluteImageUrl(posterUrl, SITE_URL),
        startDate: releaseDate || undefined,
        endDate: status === 'Ended' || status === 'Canceled' ? ((title as TmdbTvDetails).last_air_date || undefined) : undefined,
        genre: genres.length > 0 ? genres : undefined,
        numberOfSeasons: seasons || undefined,
        numberOfEpisodes: episodes || undefined,
        creator: creators.length > 0 ? creators.map((person) => personSchema(person, SITE_URL)) : undefined,
        actor: topCast.length > 0 ? topCast.slice(0, 5).map((person) => personSchema(person, SITE_URL)) : undefined,
        aggregateRating: aggregateRatingSchema(title.vote_average, title.vote_count),
        contentRating: ageRating || undefined
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'Movie',
        name: displayTitle,
        description,
        inLanguage: title.original_language || 'en',
        image: absoluteImageUrl(posterUrl, SITE_URL),
        datePublished: releaseDate || undefined,
        duration: runtime ? `PT${Math.floor(runtime / 60)}H${runtime % 60}M` : undefined,
        genre: genres.length > 0 ? genres : undefined,
        director: director ? personSchema(director, SITE_URL) : undefined,
        actor: topCast.length > 0 ? topCast.slice(0, 5).map((person) => personSchema(person, SITE_URL)) : undefined,
        aggregateRating: aggregateRatingSchema(title.vote_average, title.vote_count),
        contentRating: ageRating || undefined,
        review: aiSynopsis ? {
          '@type': 'Review',
          author: { '@type': 'Organization', name: 'Galaxy Movies' },
          reviewBody: aiSynopsis
        } : undefined
      }

  const trailerSchema = videoKey
    ? buildTrailerSchema({ title: displayTitle, uploadDate: releaseDate || undefined, thumbnailUrl: absoluteImageUrl(posterUrl, SITE_URL), videoKey })
    : null

  return (
    <>
      <PageHead
        title={isTv ? `${displayTitle} (TV Series)` : displayTitle}
        description={description}
        canonicalUrl={canonicalUrl}
        ogType={isTv ? 'video.tv_show' : 'video.movie'}
        ogTitle={displayTitle}
        ogSubtitle={ogSubtitle}
        posterPath={posterPath}
        structuredData={[structuredData, trailerSchema]}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: isTv ? 'TV Shows' : 'Movies', url: `${SITE_URL}/${isTv ? 'tv' : 'movies'}` },
          { name: displayTitle, url: canonicalUrl }
        ]}
      />
      <DetailPageShell
        backdropPath={backdropPath}
        backdropAlt={displayTitle || (isTv ? 'Show Backdrop' : 'Movie Backdrop')}
        sidebar={
          <>
            <DetailPoster
              src={posterSrc}
              alt={displayTitle || (isTv ? 'Show Poster' : 'Movie Poster')}
              onError={() => setPosterSrc('/poster_fallback.webp')}
            />

            <GenreBadges genres={title.genres} />

            <Box w='20rem' maxH='300px'>
              <WatchProviders
                watchProviders={watchProviders}
                allWatchProviders={watchProvidersByRegion}
                detectedRegion={detectedRegion}
                movieTitle={displayTitle}
                affiliateLinks={providerAffiliateLinks}
                myProviderIds={myProviderIds}
                tmdbId={title.id}
                mediaType={media}
                releaseYear={releaseYear}
              />
            </Box>
          </>
        }
      >
            <Box>
              <Flex align='center' justify={{ base: 'center', md: 'flex-start' }} gap={4} wrap='wrap'>
                <Heading color='white' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                  <Text as='span' display='inline-block'>{displayTitle}</Text>
                </Heading>
                <Badge colorPalette='whiteAlpha' bg='rgba(255,255,255,0.1)' color='white' px={2.5} py={1} borderRadius='md' fontSize='xs' border='1px solid var(--chakra-colors-white-alpha-300)' flexShrink={0}>
                  {ageRating}
                </Badge>
                {status && (
                  <Badge colorPalette={status === 'Returning Series' ? 'green' : 'gray'} px={2.5} py={1} borderRadius='md' fontSize='xs' flexShrink={0}>
                    {status}
                  </Badge>
                )}
              </Flex>
              {director && (
                <DetailCreditLine>
                  Directed by{' '}
                  <DetailCreditLink href={`/person/${director.id}`}>{director.name}</DetailCreditLink>
                </DetailCreditLine>
              )}
              {collection && (
                <DetailCreditLine mt={1}>
                  Part of the{' '}
                  <DetailCreditLink href={`/collections/${collection.id}`}>
                    {collection.name}
                  </DetailCreditLink>
                  {/collection$/i.test(collection.name.trim()) ? '' : ' collection'}
                </DetailCreditLine>
              )}
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
              w={{ base: '100%', md: isTv ? 'auto' : '14rem' }}
              justify={{ base: 'center', md: isTv ? 'flex-start' : 'space-between' }}
              gap={{ base: 4, md: isTv ? 6 : 0 }}
              wrap={isTv ? 'wrap' : undefined}
            >
              <DetailMetaItem icon={<LuCalendar />}>
                {releaseDate ? dateFormatter(releaseDate) : 'N/A'}
              </DetailMetaItem>
              {isTv ? (
                <>
                  {episodeRuntime && (
                    <DetailMetaItem icon={<LuClock />}>~{episodeRuntime}m/ep</DetailMetaItem>
                  )}
                  {seasonsLabel && (
                    <DetailMetaItem>{seasonsLabel}{episodes ? ` · ${episodes} episodes` : ''}</DetailMetaItem>
                  )}
                </>
              ) : (
                <DetailMetaItem icon={<LuClock />}>
                  {runtime ? timeFormatter(runtime) : 'N/A'}
                </DetailMetaItem>
              )}
            </Flex>

            {tagline && (
              <Text fontSize='lg' color='gray.400' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }} asChild><em>&quot;{tagline}&quot;</em></Text>
            )}

            <Text color='white' fontSize='md' textShadow='0 0 4px black' textAlign='left'>
              {title.overview || 'Description unavailable.'}
            </Text>

            <Flex align='center' justify='space-between' gap={{ base: 4, md: 0 }}>
              <VoteScore voteAverage={title.vote_average} />
              <Flex align='center' justify='flex-end'>
                <RatingWidget movie={listItem} />
              </Flex>
              <Flex align='center' justify='flex-end'>
                {logoOrg ? (
                  <CompanyLogoLink href={`${isTv ? '/network' : '/company'}/${logoOrg.id}`} company={logoOrg} />
                ) : null}
              </Flex>
            </Flex>

            <GalaxyBotTake synopsis={aiSynopsis} />

            <DetailActions videoKey={videoKey} item={listItem} />

            <CastSection cast={topCast} />

            <SimilarMovies movies={similarTitles} />
      </DetailPageShell>
    </>
  );
}
