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
import timeFormatter from '../../utils/timeFormatter'
import dateFormatter from '../../utils/dateFormatter'
import { getFirstPlayableKey } from '../../utils/youtubeCache'
import { detectRegion } from '../../utils/region'
import { useUserData } from '../../hooks/useUserData'
import { getProviderId } from '../../utils/tmdb'
import { getOrGenerateMovieReview } from '../../utils/movieReview'
import { getOrGenerateSimilarMovies } from '../../utils/similarMovies'
import { isBot } from '../../utils/rateLimiter'
import { getProviderAffiliateLinks } from '../../utils/takeads'
import { withTimeout } from '../../utils/withTimeout'
import { absoluteImageUrl, aggregateRatingSchema, buildOgImageUrl, personSchema } from '../../utils/schema'
import type { SimilarTitle } from '../../utils/similarMovies'
import type {
  CastMember,
  Credits,
  ReleaseDatesResponse,
  TmdbMovie,
  TmdbMovieDetails,
  TmdbPaged,
  WatchProvidersRegion,
  WatchProvidersResponse
} from '../../types/tmdb'
import { LuCalendar, LuClock } from 'react-icons/lu';

type MoviePageProps = {
  movie: TmdbMovieDetails
  videoKey: string | null
  watchProviders: WatchProvidersRegion | null
  watchProvidersByRegion: Record<string, WatchProvidersRegion>
  detectedRegion: string
  director: { id: number; name: string } | null
  topCast: CastMember[]
  ageRating: string
  aiSynopsis: string | null
  similarMovies: SimilarTitle[]
  providerAffiliateLinks: Record<string, string | null>
}

type Props =
  | { movieError: string }
  | MoviePageProps

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const { movieId } = context.query

  if (!/^\d{1,10}$/.test(String(movieId))) return { notFound: true }

  try {
    const [movieRes, providersRes, creditsRes, releaseDatesRes, recommendationsRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=videos`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/movie/${movieId}/recommendations?api_key=${process.env.TMDB_API_KEY}`)
    ])

    if (!movieRes.ok) {
      if (movieRes.status === 404) return { notFound: true }
      return {
        props: {
          movieError: movieRes.status === 401
            ? 'Movie data is unavailable because the configured TMDB API key was rejected.'
            : 'Movie data is temporarily unavailable. Please try again later.'
        }
      }
    }

    const movieData: TmdbMovieDetails = await movieRes.json()
    const providersData: WatchProvidersResponse = await providersRes.json()
    const creditsData: Credits = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] }
    const releaseDatesData: ReleaseDatesResponse = releaseDatesRes.ok ? await releaseDatesRes.json() : { results: [] }
    const usRelease = releaseDatesData.results?.find((r) => r.iso_3166_1 === 'US')
    const cert = usRelease?.release_dates?.find((d) => d.certification)?.certification || 'NR'
    const countryCode = detectRegion(context.req)
    const userProviders = providersData.results?.[countryCode] || providersData.results?.US || Object.values(providersData.results || {})[0] || null
    const directorObj = creditsData.crew?.find((person) => person.job === 'Director')
    const director = directorObj ? { id: directorObj.id, name: directorObj.name } : null
    const topCast = creditsData.cast?.slice(0, 15) || []

    const recommendationsData: Partial<TmdbPaged<TmdbMovie>> = recommendationsRes.ok ? await recommendationsRes.json() : { results: [] }
    const recommendationCandidates = (recommendationsData.results || [])
      .filter((candidate) => candidate?.id && candidate.poster_path && candidate.id !== movieData.id)

    const providerNames = (['flatrate', 'rent', 'buy'] as const)
      .flatMap((key) => (userProviders?.[key] || []).map((p) => p.provider_name))

    // Bots still get already-cached content but never trigger generation;
    // their renders aren't CDN-cached, so an AI-less page can't be served to
    // humans/Googlebot.
    const skipAi = isBot(context.req.headers['user-agent'])

    const [validVideoKey, aiSynopsis, similarMovies, providerAffiliateLinks] = await Promise.all([
      withTimeout(getFirstPlayableKey(movieData.videos?.results), 3000, null),
      movieData.overview
        ? withTimeout(getOrGenerateMovieReview({
            movieId: movieData.id,
            title: movieData.title,
            overview: movieData.overview,
            genres: movieData.genres?.map((g) => g.name) || [],
            generate: !skipAi
          }), 4500, null)
        : null,
      recommendationCandidates.length > 0
        ? withTimeout(getOrGenerateSimilarMovies({
            movieId: movieData.id,
            title: movieData.title,
            overview: movieData.overview,
            genres: movieData.genres?.map((g) => g.name) || [],
            candidates: recommendationCandidates,
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
        movie: movieData,
        videoKey: validVideoKey || null,
        watchProviders: userProviders,
        watchProvidersByRegion: providersData.results || {},
        detectedRegion: countryCode,
        director,
        topCast,
        ageRating: cert,
        aiSynopsis: aiSynopsis || null,
        similarMovies: similarMovies || [],
        providerAffiliateLinks
      }
    }
  } catch (error) {
    console.error(error)
    return {
      props: {
        movieError: 'Movie data is temporarily unavailable. Please try again later.'
      }
    }
  }
}

export default function Movie(props: Props) {
  if ('movieError' in props) {
    return <MovieErrorView message={props.movieError} />
  }
  return <MovieContent {...props} />
}

function MovieErrorView({ message }: { message: string }) {
  return <DetailErrorView title='Movie unavailable' message={message} />
}

function MovieContent({ movie, videoKey, watchProviders, watchProvidersByRegion, detectedRegion, director, topCast, ageRating, aiSynopsis, similarMovies, providerAffiliateLinks }: MoviePageProps) {
  const backdropPath = movie.backdrop_path || null
  const posterPath = movie.poster_path || null
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
  const productionCompany = movie.production_companies?.find(company => company.logo_path)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/movies/${movie.id}`
  const description = movie.overview || `Where to watch ${movie.title}.`
  const genres = movie.genres?.map(g => g.name) || []
  const ogPoster = movie.poster_path
  const ogSubtitle = movie.tagline || description
  const ogImage = buildOgImageUrl({ siteUrl, title: movie.title, subtitle: ogSubtitle, posterPath: ogPoster })
  const isoDuration = movie.runtime
    ? `PT${Math.floor(movie.runtime / 60)}H${movie.runtime % 60}M`
    : undefined

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    description,
    inLanguage: movie.original_language || 'en',
    image: absoluteImageUrl(posterUrl, siteUrl),
    datePublished: movie.release_date || undefined,
    duration: isoDuration,
    genre: genres.length > 0 ? genres : undefined,
    director: director ? personSchema(director, siteUrl) : undefined,
    actor: topCast.length > 0 ? topCast.slice(0, 5).map(person => personSchema(person, siteUrl)) : undefined,
    aggregateRating: aggregateRatingSchema(movie.vote_average, movie.vote_count),
    contentRating: ageRating || undefined,
    review: aiSynopsis ? {
      '@type': 'Review',
      author: { '@type': 'Organization', name: 'Galaxy Movies' },
      reviewBody: aiSynopsis
    } : undefined
  }

  const trailer = videoKey
    ? { title: movie.title, uploadDate: movie.release_date || undefined, thumbnailUrl: absoluteImageUrl(posterUrl, siteUrl), videoKey }
    : null

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'Movies', url: `${siteUrl}/movies` },
    { name: movie.title, url: canonicalUrl }
  ]

  return (
    <>
      <DetailHead
        pageTitle={`${movie.title} | Galaxy Movies`}
        description={description}
        canonicalUrl={canonicalUrl}
        ogType='video.movie'
        ogImage={ogImage}
        structuredData={structuredData}
        trailer={trailer}
        breadcrumbItems={breadcrumbItems}
      />
      <DetailPageShell
        backdropSrc={backdropSrc}
        backdropAlt={movie.title || 'Movie Backdrop'}
        onBackdropError={() => setBackdropSrc('/backdrop_fallback.webp')}
        sidebar={
          <>
            <DetailPoster
              src={posterSrc}
              alt={movie.title || 'Movie Poster'}
              onError={() => setPosterSrc('/poster_fallback.webp')}
            />

            <GenreBadges genres={movie.genres} />

            <Box w='20rem' maxH='300px'>
              <WatchProviders
                watchProviders={watchProviders}
                allWatchProviders={watchProvidersByRegion}
                detectedRegion={detectedRegion}
                movieTitle={movie.title}
                affiliateLinks={providerAffiliateLinks}
                myProviderIds={myProviderIds}
                tmdbId={movie.id}
                mediaType='movie'
                releaseYear={Number((movie.release_date || '').slice(0, 4)) || null}
              />
            </Box>
          </>
        }
      >
            <Box>
              <Flex align='center' justify={{ base: 'center', md: 'flex-start' }} gap={4} wrap='wrap'>
                <Heading color='white' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                  <Text as='span' display='inline-block'>{movie.title}</Text>
                </Heading>
                <Badge colorPalette='whiteAlpha' bg='rgba(255,255,255,0.1)' color='white' px={2.5} py={1} borderRadius='md' fontSize='xs' border='1px solid' borderColor='whiteAlpha.300' flexShrink={0}>
                  {ageRating}
                </Badge>
              </Flex>
              {director && (
                <DetailCreditLine>
                  Directed by{' '}
                  <DetailCreditLink href={`/person/${director.id}`}>{director.name}</DetailCreditLink>
                </DetailCreditLine>
              )}
              {movie.belongs_to_collection && (
                <DetailCreditLine mt={1}>
                  Part of the{' '}
                  <DetailCreditLink href={`/collections/${movie.belongs_to_collection.id}`}>
                    {movie.belongs_to_collection.name}
                  </DetailCreditLink>
                  {/collection$/i.test(movie.belongs_to_collection.name.trim()) ? '' : ' collection'}
                </DetailCreditLine>
              )}
            </Box>

            <Flex
              w={{ base: '100%', md: '14rem' }}
              justify={{ base: 'center', md: 'space-between' }}
              gap={{ base: 4, md: 0 }}
            >
              <DetailMetaItem icon={<LuCalendar />}>
                {movie.release_date ? dateFormatter(movie.release_date) : 'N/A'}
              </DetailMetaItem>
              <DetailMetaItem icon={<LuClock />}>
                {movie.runtime ? timeFormatter(movie.runtime) : 'N/A'}
              </DetailMetaItem>
            </Flex>

            {movie.tagline && (
              <Text fontSize='lg' color='gray.400' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }} asChild><em>&quot;{movie.tagline}&quot;</em></Text>
            )}

            <Text color='white' fontSize='md' textShadow='0 0 4px black' textAlign='left'>
              {movie.overview || 'Description unavailable.'}
            </Text>

            <Flex align='center' justify='space-between' gap={{ base: 4, md: 0 }}>
              <VoteScore voteAverage={movie.vote_average} />
              <Flex align='center' justify='flex-end'>
                <RatingWidget movie={movie} />
              </Flex>
              <Flex align='center' justify='flex-end'>
                {productionCompany ? (
                  <CompanyLogoLink href={`/company/${productionCompany.id}`} company={productionCompany} />
                ) : null}
              </Flex>
            </Flex>

            <GalaxyBotTake synopsis={aiSynopsis} />

            <DetailActions videoKey={videoKey} item={movie} />

            <CastSection cast={topCast} />

            <SimilarMovies movies={similarMovies} />
      </DetailPageShell>
    </>
  );
}