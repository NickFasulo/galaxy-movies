import type { GetServerSideProps } from 'next'
import { useState } from 'react'
import Link from 'next/link'
import { Flex, Box, Heading, Text, chakra } from '@chakra-ui/react'
import DetailPageShell from './DetailPageShell'
import { DetailPoster, DetailErrorView, DetailMetaItem } from './DetailBits'
import GenreBadges from './GenreBadges'
import PageHead from '../../../components/PageHead'
import { getFirstPlayableVideo } from '../youtubeCache'
import { fetchTmdb, TmdbError, isAnimeTitle } from '../tmdb'
import { withTimeout } from '../../../lib/withTimeout'
import { setSwrCache } from '../../../lib/http'
import { videoObjectSchema } from '../schema'
import { SITE_URL } from '../../../lib/site'
import { dateFormatter, timeFormatter } from '../../../lib/format/formatters'
import type { MediaType, TmdbMovieDetails, TmdbTvDetails } from '../../../types/tmdb'
import { LuCalendar, LuClock } from 'react-icons/lu'

const Iframe = chakra('iframe')

interface TrailerVideo {
  key: string
  name?: string
  publishedAt?: string
}

export type TrailerProps =
  | { media: MediaType; title: TmdbMovieDetails & TmdbTvDetails; video: TrailerVideo }
  | { media: MediaType; error: string }

export function trailerServerSideProps(media: MediaType): GetServerSideProps<TrailerProps> {
  const noun = media === 'movie' ? 'Movie' : 'Show'
  const idParam = media === 'movie' ? 'movieId' : 'showId'
  return async (context) => {
    const id = String(context.query[idParam] || '')
    if (!/^\d{1,10}$/.test(id)) return { notFound: true }
    try {
      const title = await fetchTmdb<TmdbMovieDetails & TmdbTvDetails>(`/${media}/${id}`, { append_to_response: 'videos' })
      const video = await withTimeout(getFirstPlayableVideo(title.videos?.results), 3000, null)
      if (!video) return { notFound: true }
      if (context.res) setSwrCache(context.res)
      return {
        props: {
          media,
          title,
          video: { key: video.key, name: video.name, publishedAt: video.published_at }
        }
      }
    } catch (err) {
      if (err instanceof TmdbError && err.status === 404) return { notFound: true }
      console.error(err)
      return { props: { media, error: `${noun} trailer is temporarily unavailable. Please try again later.` } }
    }
  }
}

export default function TrailerPage(props: TrailerProps) {
  if ('error' in props) {
    return <DetailErrorView title='Trailer unavailable' message={props.error} />
  }
  return <TrailerContent {...props} />
}

// Dedicated watch page: the player must exist at a real size/position in the
// rendered HTML (no click-to-load) and the video must be the page's main
// content — Google's two hard requirements for video indexing. The detail
// page's modal embed fails both, which is why this route exists.
function TrailerContent({ media, title, video }: Exclude<TrailerProps, { error: string }>) {
  const isTv = media === 'tv'
  const displayTitle = isTv ? title.name : title.title
  const releaseDate = isTv ? title.first_air_date : title.release_date
  const runtime = isTv ? title.episode_run_time?.find((mins) => mins > 0) : title.runtime
  const releaseYear = Number((releaseDate || '').slice(0, 4)) || null
  const detailPath = `/${isTv ? 'tv' : 'movies'}/${title.id}`
  const detailUrl = `${SITE_URL}${detailPath}`
  const canonicalUrl = `${detailUrl}/trailer`
  const posterPath = title.poster_path || null
  const [posterSrc, setPosterSrc] = useState(posterPath || '/poster_fallback.webp')
  const [prevPosterPath, setPrevPosterPath] = useState(posterPath)

  // Same client-nav reset as the detail page — prev-check setState-during-render.
  if (prevPosterPath !== posterPath) {
    setPrevPosterPath(posterPath)
    setPosterSrc(posterPath || '/poster_fallback.webp')
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.key}`
  const videoSchema = videoObjectSchema({
    key: video.key,
    name: video.name || `${displayTitle} — Official Trailer`,
    description: `Official trailer for ${displayTitle}.`,
    uploadDate: video.publishedAt
  })

  return (
    <>
      <PageHead
        title={`${displayTitle} Official Trailer${releaseYear ? ` (${releaseYear})` : ''}`}
        description={`Watch the official trailer for ${displayTitle}, then see where to stream it.`}
        canonicalUrl={canonicalUrl}
        ogType='video.other'
        ogTitle={`${displayTitle} — Official Trailer`}
        ogSubtitle={title.tagline || title.overview || undefined}
        posterPath={posterPath}
        backdropPath={title.backdrop_path}
        // Mirrors the detail page's thinness rule — a trailer page for a title
        // TMDB hasn't described is the same near-duplicate stub.
        noindex={!title.overview}
        structuredData={[videoSchema]}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: isTv ? 'TV Shows' : 'Movies', url: `${SITE_URL}${isTv ? '/tv' : '/browse'}` },
          { name: displayTitle, url: detailUrl },
          { name: 'Trailer', url: canonicalUrl }
        ]}
      >
        <link rel='preconnect' href='https://www.youtube-nocookie.com' />
        <meta property='og:video' content={embedUrl} />
        <meta property='og:video:type' content='text/html' />
      </PageHead>
      <DetailPageShell
        backdropPath={title.backdrop_path || null}
        backdropAlt={displayTitle || (isTv ? 'Show Backdrop' : 'Movie Backdrop')}
        sidebar={
          <>
            <DetailPoster
              src={posterSrc}
              alt={displayTitle || (isTv ? 'Show Poster' : 'Movie Poster')}
              onError={() => setPosterSrc('/poster_fallback.webp')}
            />
            <GenreBadges genres={title.genres} mediaType={media} isAnime={isAnimeTitle(title, media)} />
            <Box w='20rem' maxW='100%' bg='surface.raised' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='lg' p={4}>
              <Text color='white' fontWeight='bold' fontSize='sm' mb={1}>
                Where to watch {displayTitle}
              </Text>
              <Text color='gray.400' fontSize='sm' mb={3}>
                Streaming, rent, and buy options, updated daily.
              </Text>
              <Text fontSize='sm' color='brand.accent' _hover={{ color: 'white' }} asChild>
                <Link href={detailPath}>See where it&apos;s streaming →</Link>
              </Text>
            </Box>
          </>
        }
      >
        <Heading as='h1' color='white' letterSpacing='-0.02em' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
          {displayTitle} — Official Trailer
        </Heading>

        <Flex align='center' justify={{ base: 'center', md: 'flex-start' }} gap={{ base: 4, md: 6 }} wrap='wrap'>
          <DetailMetaItem icon={<LuCalendar />}>
            {releaseDate ? dateFormatter(releaseDate) : 'N/A'}
          </DetailMetaItem>
          <DetailMetaItem icon={<LuClock />}>
            {isTv ? (runtime ? `~${runtime}m/ep` : 'N/A') : (runtime ? timeFormatter(runtime) : 'N/A')}
          </DetailMetaItem>
        </Flex>

        <Box
          w='100%'
          aspectRatio={16 / 9}
          bg='black'
          borderRadius='lg'
          overflow='hidden'
          border='1px solid var(--chakra-colors-border-subtle)'
          position='relative'
        >
          <Iframe
            src={`${embedUrl}?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`}
            allow='fullscreen; encrypted-media; picture-in-picture'
            allowFullScreen
            title={video.name || `${displayTitle} official trailer`}
            position='absolute'
            inset={0}
            width='100%'
            height='100%'
            border={0}
          />
        </Box>

        {title.overview && (
          <Text color='white' fontSize='md' textShadow='0 0 4px black' textAlign='left'>
            {title.overview}
          </Text>
        )}

        <Text fontSize='sm' color='gray.400' _hover={{ color: 'white' }} textShadow='0 0 4px black' asChild>
          <Link href={detailPath}>← Back to {displayTitle}</Link>
        </Text>
      </DetailPageShell>
    </>
  )
}
