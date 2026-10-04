import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  Flex,
  Wrap,
  WrapItem,
  Badge,
  Heading,
  Text,
  Box
} from '@chakra-ui/react'
import { StarIcon, CalendarIcon, TimeIcon } from '@chakra-ui/icons'
import VideoModal from '../../components/VideoModal'
import BackButton from '../../components/BackButton'
import ProductionLogo from '../../components/ProductionLogo'
import WatchProviders from '../../components/WatchProviders'
import ActorAvatar from '../../components/ActorAvatar'
import BreadcrumbSchema from '../../components/BreadcrumbSchema'
import HreflangTags from '../../components/HreflangTags'
import dateFormatter from '../../utils/dateFormatter'
import { getFirstPlayableKey } from '../../utils/youtubeCache'
import { detectRegion } from '../../utils/region'
import { useUserData } from '../../hooks/useUserData'
import { getProviderId } from '../../utils/tmdb'
import { getProviderAffiliateLinks } from '../../utils/takeads'

export const getServerSideProps = async (context) => {
  const { showId } = context.query

  try {
    const [showRes, providersRes, creditsRes, contentRatingsRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/tv/${showId}?api_key=${process.env.TMDB_API_KEY}&append_to_response=videos`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/aggregate_credits?api_key=${process.env.TMDB_API_KEY}`),
      fetch(`https://api.themoviedb.org/3/tv/${showId}/content_ratings?api_key=${process.env.TMDB_API_KEY}`)
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

    const showData = await showRes.json()
    const providersData = await providersRes.json()
    const creditsData = creditsRes.ok ? await creditsRes.json() : { cast: [], crew: [] }
    const contentRatingsData = contentRatingsRes.ok ? await contentRatingsRes.json() : { results: [] }
    const usRating = contentRatingsData.results?.find((r) => r.iso_3166_1 === 'US')
    const cert = usRating?.rating || 'NR'
    const countryCode = detectRegion(context.req)
    const userProviders = providersData.results?.[countryCode] || providersData.results?.US || Object.values(providersData.results || {})[0] || null
    const creators = (showData.created_by || []).map((person) => ({ id: person.id, name: person.name }))
    const topCast = creditsData.cast?.slice(0, 15) || []

    const providerNames = ['flatrate', 'rent', 'buy']
      .flatMap((key) => (userProviders?.[key] || []).map((p) => p.provider_name))

    const [validVideoKey, providerAffiliateLinks] = await Promise.all([
      getFirstPlayableKey(showData.videos?.results),
      getProviderAffiliateLinks(providerNames)
    ])

    if (context.res) {
      context.res.setHeader(
        'Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=86400'
      )
    }

    return {
      props: {
        show: showData,
        videoKey: validVideoKey || null,
        watchProviders: userProviders,
        creators,
        topCast,
        ageRating: cert,
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

export default function TvShow({ show, showError, videoKey, watchProviders, creators, topCast, ageRating, providerAffiliateLinks }) {
  if (showError) {
    return (
      <>
        <Head>
          <title>Show unavailable | Galaxy Movies</title>
          <meta name='description' content={showError} />
        </Head>
        <Box minH='100vh' p={8} pt={20} textAlign='center' bg='#14181c' color='white'>
          <Text mt={20}>{showError}</Text>
          <Link href='/'>Return to Galaxy Movies</Link>
        </Box>
      </>
    )
  }

  const backdropPath = show.backdrop_path || null
  const posterPath = show.poster_path || null
  const posterUrl = posterPath
    ? `https://image.tmdb.org/t/p/w500${posterPath}`
    : '/poster_fallback.webp'
  const [backdropSrc, setBackdropSrc] = useState(backdropPath || '/backdrop_fallback.webp')
  const [posterSrc, setPosterSrc] = useState(posterPath || '/poster_fallback.webp')

  useEffect(() => {
    setBackdropSrc(backdropPath || '/backdrop_fallback.webp')
  }, [backdropPath])

  useEffect(() => {
    setPosterSrc(posterPath || '/poster_fallback.webp')
  }, [posterPath])

  const { services } = useUserData()
  const myProviderIds = new Set(
    services.providers.map((key) => getProviderId(key, services.region)).filter(Boolean)
  )
  const network = show.networks?.find((n) => n.logo_path)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const canonicalUrl = `${siteUrl}/tv/${show.id}`
  const description = show.overview || `Where to watch ${show.name}.`
  const genres = show.genres?.map(g => g.name) || []
  const ogPoster = show.poster_path
  const ogSubtitle = description
  const ogImage = `${siteUrl}/api/og?${new URLSearchParams({
    title: show.name,
    subtitle: ogSubtitle,
    ...(ogPoster ? { poster: `https://image.tmdb.org/t/p/w500${ogPoster}` } : {})
  }).toString()}`

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
    image: posterUrl.startsWith('http') ? posterUrl : `${siteUrl}${posterUrl.startsWith('/') ? posterUrl : '/' + posterUrl}`,
    startDate: show.first_air_date || undefined,
    endDate: show.status === 'Ended' || show.status === 'Canceled' ? (show.last_air_date || undefined) : undefined,
    genre: genres.length > 0 ? genres : undefined,
    numberOfSeasons: show.number_of_seasons || undefined,
    numberOfEpisodes: show.number_of_episodes || undefined,
    creator: creators.length > 0 ? creators.map((person) => ({
      '@type': 'Person',
      name: person.name,
      url: `${siteUrl}/person/${person.id}`
    })) : undefined,
    actor: topCast.length > 0 ? topCast.slice(0, 5).map(person => ({
      '@type': 'Person',
      name: person.name,
      url: `${siteUrl}/person/${person.id}`
    })) : undefined,
    aggregateRating: show.vote_count > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: show.vote_average,
      ratingCount: show.vote_count,
      bestRating: 10,
      worstRating: 0
    } : undefined,
    contentRating: ageRating || undefined
  }

  const videoObjectData = videoKey ? {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: `${show.name} Trailer`,
    description: `Watch the official trailer for ${show.name}`,
    inLanguage: 'en',
    thumbnailUrl: posterUrl.startsWith('http') ? posterUrl : `${siteUrl}${posterUrl.startsWith('/') ? posterUrl : '/' + posterUrl}`,
    uploadDate: show.first_air_date || undefined,
    contentUrl: `https://www.youtube.com/watch?v=${videoKey}`,
    embedUrl: `https://www.youtube.com/embed/${videoKey}`
  } : null

  const breadcrumbItems = [
    { name: 'Home', url: siteUrl },
    { name: 'TV Shows', url: `${siteUrl}/tv` },
    { name: show.name, url: canonicalUrl }
  ]

  return (
    <>
      <Head>
        <title>{`${show.name} (TV Series) | Galaxy Movies`}</title>
        <meta name='description' content={description} />
        <link rel='canonical' href={canonicalUrl} />
        <HreflangTags canonicalUrl={canonicalUrl} />

        <meta property='og:type' content='video.tv_show' />
        <meta property='og:site_name' content='Galaxy Movies' />
        <meta property='og:locale' content='en_US' />
        <meta property='og:title' content={`${show.name} (TV Series) | Galaxy Movies`} />
        <meta property='og:description' content={description} />
        <meta property='og:url' content={canonicalUrl} />
        <meta property='og:image' content={ogImage} />
        <meta property='og:image:width' content='1200' />
        <meta property='og:image:height' content='630' />

        <meta name='twitter:card' content='summary_large_image' />
        <meta name='twitter:title' content={`${show.name} (TV Series) | Galaxy Movies`} />
        <meta name='twitter:description' content={description} />
        <meta name='twitter:image' content={ogImage} />

        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c')
          }}
        />
        {videoObjectData && (
          <script
            type='application/ld+json'
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(videoObjectData).replace(/</g, '\\u003c')
            }}
          />
        )}
        <BreadcrumbSchema items={breadcrumbItems} />
      </Head>
      <Box position='relative' minH='100vh' bg='#14181c' overflow='hidden'>
      <Box
        position='absolute'
        top={{ base: 'auto', md: 0 }}
        bottom={{ base: 0, md: 'auto' }}
        left={0}
        right={0}
        h={{ base: '400px', md: '500px' }}
        zIndex={0}
      >
        <Box
          position='relative'
          h='100%'
          w='100%'
          sx={{
            img: {
              objectFit: 'cover',
              objectPosition: { base: 'center bottom', md: 'center 20%' }
            }
          }}
        >
          {backdropSrc === '/backdrop_fallback.webp' ? (
            <img
              src='/backdrop_fallback_lg.webp'
              srcSet='/backdrop_fallback.webp 1376w, /backdrop_fallback_lg.webp 2560w'
              sizes='100vw'
              alt={show.name || 'Show Backdrop'}
              fetchpriority='high'
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          ) : (
            <Image
              src={backdropSrc}
              alt={show.name || 'Show Backdrop'}
              fill
              priority
              sizes='100vw'
              onError={() => setBackdropSrc('/backdrop_fallback.webp')}
            />
          )}
        </Box>
        <Box
          position='absolute'
          inset={0}
          bgGradient={{
            base: 'linear(to-t, rgba(20,24,28,0.2) 0%, rgba(20,24,28,0.7) 60%, #14181c 100%)',
            md: 'linear(to-b, rgba(20,24,28,0.2) 0%, rgba(20,24,28,0.7) 60%, #14181c 100%)'
          }}
        />
        <Box
          position='absolute'
          inset={0}
          bgGradient={{
            base: 'linear(to-r, #14181c 0%, transparent 20%, transparent 80%, #14181c 100%)',
            md: 'linear(to-r, #14181c 0%, transparent 20%, transparent 80%, #14181c 100%)'
          }}
        />
      </Box>

      <Flex position='relative' zIndex={1} justify='center' align='flex-start' minH='100vh' pt={{ base: '4rem', md: '12rem' }} pb={{ base: '2rem', md: '4rem' }}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'center', md: 'flex-start' }} justify='center' maxW='1200px' w='100%' px='1rem' gap={{ base: '1.5rem', md: '2.5rem' }}>

          <Flex align='center' direction='column' position={{ base: 'relative', md: 'sticky' }} top={{ md: '2rem' }} w='20rem' flexShrink={0} gap='1rem'>
            <Box position='relative' w={{ base: '20rem', md: '20rem' }} h={{ base: '30rem', md: '30rem' }}>
              <Image
                src={posterSrc}
                alt={show.name || 'Show Poster'}
                fill
                priority
                sizes='(max-width: 768px) 100vw, 320px'
                onError={() => setPosterSrc('/poster_fallback.webp')}
                style={{ objectFit: 'cover', borderRadius: '1rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)' }}
                unoptimized={posterSrc === '/poster_fallback.webp'}
              />
            </Box>

            <Wrap justify='center' spacing={{ base: 4, md: 2 }}>
              {show.genres?.map((genre) => (
                <WrapItem key={genre.id}><Badge>{genre.name}</Badge></WrapItem>
              ))}
            </Wrap>

            <Box w='20rem' maxH='300px' overflowY='auto'>
              <WatchProviders watchProviders={watchProviders} movieTitle={show.name} affiliateLinks={providerAffiliateLinks} myProviderIds={myProviderIds} />
            </Box>

          </Flex>

          <Flex direction='column' w={{ base: '20rem', md: '40rem' }} maxW='100%' gap='1rem'>
            <Box>
              <Flex align='center' justify={{ base: 'center', md: 'flex-start' }} gap={4} wrap='wrap'>
                <Heading color='white' textShadow='0 0 4px black' textAlign={{ base: 'center', md: 'left' }}>
                  <Text as='span' display='inline-block'>{show.name}</Text>
                </Heading>
                <Badge colorScheme='whiteAlpha' bg='rgba(255,255,255,0.1)' color='white' px={2.5} py={1} borderRadius='md' fontSize='xs' border='1px solid' borderColor='whiteAlpha.300' flexShrink={0}>
                  {ageRating}
                </Badge>
                {show.status && (
                  <Badge colorScheme={show.status === 'Returning Series' ? 'green' : 'gray'} px={2.5} py={1} borderRadius='md' fontSize='xs' flexShrink={0}>
                    {show.status}
                  </Badge>
                )}
              </Flex>
              {creators.length > 0 && (
                <Text
                  fontSize='sm'
                  color='gray.400'
                  textShadow='0 0 4px black'
                  mt={{ base: 4, md: 1 }}
                  textAlign={{ base: 'center', md: 'left' }}
                >
                  Created by{' '}
                  {creators.map((person, index) => (
                    <span key={person.id}>
                      {index > 0 && ', '}
                      <Link href={`/person/${person.id}`} passHref>
                        <Text
                          as='span'
                          color='white'
                          fontWeight='semibold'
                          _hover={{ textDecoration: 'underline' }}
                          cursor='pointer'
                        >
                          {person.name}
                        </Text>
                      </Link>
                    </span>
                  ))}
                </Text>
              )}
            </Box>

            <Flex
              w={{ base: '100%', md: 'auto' }}
              justify={{ base: 'center', md: 'flex-start' }}
              gap={{ base: 4, md: 6 }}
              wrap='wrap'
            >
              <Flex align='center'>
                <CalendarIcon color='white' />
                <Text color='white' textShadow='0 0 4px black' ml={1.5}>{dateFormatter(show.first_air_date) || 'N/A'}</Text>
              </Flex>
              {episodeRuntime && (
                <Flex align='center'>
                  <TimeIcon color='white' />
                  <Text color='white' textShadow='0 0 4px black' ml={1.5}>~{episodeRuntime}m/ep</Text>
                </Flex>
              )}
              {seasonsLabel && (
                <Flex align='center'>
                  <Text color='white' textShadow='0 0 4px black'>{seasonsLabel}{show.number_of_episodes ? ` · ${show.number_of_episodes} episodes` : ''}</Text>
                </Flex>
              )}
            </Flex>

            <Text color='white' fontSize='md' textShadow='0 0 4px black' textAlign='left'>
              {show.overview || 'Description unavailable.'}
            </Text>

            <Flex align='center' justify='space-between' gap={{ base: 4, md: 0 }}>
              <Flex align='center'>
                <StarIcon boxSize={5} color='gold' />
                <Text
                  fontSize='lg'
                  ml={2}
                  color='white'
                  textShadow='2px 0 4px black'
                  textAlign='center'
                >
                  {show.vote_average ? Math.round(show.vote_average * 10) / 10 : 'TBD'}
                </Text>
              </Flex>
              <Flex align='center' justify='flex-end'>
                {network ? <ProductionLogo company={network} /> : null}
              </Flex>
            </Flex>

            <Flex
              direction={{ base: 'column', md: 'row' }}
              align={{ base: 'center', md: 'flex-end' }}
              justify={{ base: 'center', md: 'space-evenly' }}
              gap='2rem'
              w='100%'
              py={{ base: '1rem', md: 0 }}
              my='1rem'
            >
              <VideoModal videoKey={videoKey} />
              <BackButton />
            </Flex>

            {topCast.length > 0 && (
              <Box mb={4}>
                <Text
                  color='gray.400'
                  fontSize='xs'
                  fontWeight='bold'
                  textTransform='uppercase'
                  textShadow='0 0 4px black'
                  textAlign='center'
                  position='relative'
                  display='flex'
                  alignItems='center'
                  gap={3}
                  mb={2}
                  _before={{ content: '""', flex: 1, borderTop: '1px solid', borderColor: 'whiteAlpha.400' }}
                  _after={{ content: '""', flex: 1, borderTop: '1px solid', borderColor: 'whiteAlpha.400' }}
                >
                  Cast
                </Text>
                <Wrap spacing={3} justify='center'>
                  {topCast.map((actor) => (
                    <WrapItem key={actor.id}>
                      <Link href={`/person/${actor.id}`} passHref>
                        <Flex
                          align='center'
                          bg='rgba(255, 255, 255, 0.1)'
                          px={3.5}
                          py={1.5}
                          borderRadius='full'
                          gap={2.5}
                          cursor='pointer'
                          transition='all 0.2s ease-in-out'
                          _hover={{
                            bg: 'rgba(255, 255, 255, 0.2)',
                            transform: 'translateY(-2px)'
                          }}
                        >
                          <ActorAvatar profilePath={actor.profile_path} name={actor.name} />
                          <Text fontSize='sm' color='white' fontWeight='medium' textShadow='0 0 4px black'>
                            {actor.name}
                          </Text>
                        </Flex>
                      </Link>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            )}

          </Flex>

        </Flex>
      </Flex>
      </Box>
    </>
  )
}
