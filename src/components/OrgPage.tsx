import type { GetServerSideProps } from 'next'
import Image from 'next/image'
import { useState } from 'react'
import { Box, Flex, Heading, Text, Badge, Link as ChakraLink, Icon } from '@chakra-ui/react'
import BackButton from './BackButton'
import MovieGrid from './MovieGrid'
import { BottomBackdrop } from './Backdrop'
import PageHead from './PageHead'
import DetailErrorView from './DetailErrorView'
import { normalizeTvTitle } from '../utils/tmdb'
import { setSwrCache } from '../utils/ssr'
import { tmdbImage, SITE_URL } from '../utils/site'
import { LuExternalLink } from 'react-icons/lu'
import type { TmdbCompany, TmdbMovie, TmdbPaged, TmdbTvShow, TitleSummary } from '../types/tmdb'

export type OrgKind = 'company' | 'network'

interface OrgConfig {
  apiSegment: string
  discoverPath: string
  discoverQuery: (id: string) => string
  normalize: (results: (TmdbMovie | TmdbTvShow)[]) => TitleSummary[]
  basePath: string
  crumbRoot: { name: string; path: string }
  accent: string
  titleSuffix: string
  ogLabel: string
  releasesHeading: string
  emptyText: string
  noun: string
  fallbackDescription: (name: string) => string
}

const CONFIG: Record<OrgKind, OrgConfig> = {
  company: {
    apiSegment: 'company',
    discoverPath: 'movie',
    discoverQuery: (id) => `with_companies=${id}&sort_by=popularity.desc&page=1`,
    normalize: (results) => results as TitleSummary[],
    basePath: '/company',
    crumbRoot: { name: 'Companies', path: '/company' },
    accent: 'teal',
    titleSuffix: '',
    ogLabel: 'Production Company',
    releasesHeading: 'Popular Releases',
    emptyText: 'No movies found for this production company.',
    noun: 'Company',
    fallbackDescription: (name) => `Explore movies produced by ${name}.`
  },
  network: {
    apiSegment: 'network',
    discoverPath: 'tv',
    discoverQuery: (id) => `with_networks=${id}&sort_by=vote_count.desc&vote_count.gte=100&page=1`,
    normalize: (results) => (results as TmdbTvShow[]).filter((s) => s.poster_path).map(normalizeTvTitle),
    basePath: '/network',
    crumbRoot: { name: 'TV Shows', path: '/tv' },
    accent: 'purple',
    titleSuffix: ' Shows',
    ogLabel: 'TV Network',
    releasesHeading: 'Popular Shows',
    emptyText: 'No shows found for this network.',
    noun: 'Network',
    fallbackDescription: (name) => `Explore TV shows airing on ${name}.`
  }
}

export type OrgPageProps =
  | { kind: OrgKind; error: string }
  | { kind: OrgKind; org: TmdbCompany; titles: TitleSummary[] }

export function orgServerSideProps(kind: OrgKind): GetServerSideProps<OrgPageProps> {
  const { apiSegment, discoverPath, discoverQuery, normalize, noun } = CONFIG[kind]

  return async (context) => {
    const id = String(context.query[`${kind}Id`] || '')
    if (!/^\d{1,10}$/.test(id)) return { notFound: true }

    const errorProps = (error: string) => ({ props: { kind, error } })

    try {
      const [orgRes, titlesRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${apiSegment}/${id}?api_key=${process.env.TMDB_API_KEY}`),
        fetch(`https://api.themoviedb.org/3/discover/${discoverPath}?api_key=${process.env.TMDB_API_KEY}&${discoverQuery(id)}`)
      ])

      if (!orgRes.ok) {
        if (orgRes.status === 404) return { notFound: true }
        return errorProps(orgRes.status === 401
          ? `${noun} data is unavailable because the configured TMDB API key was rejected.`
          : `${noun} data is temporarily unavailable. Please try again later.`)
      }

      const org: TmdbCompany = await orgRes.json()
      const titlesData: Partial<TmdbPaged<TmdbMovie | TmdbTvShow>> = titlesRes.ok ? await titlesRes.json() : { results: [] }

      if (context.res) setSwrCache(context.res)

      return {
        props: {
          kind,
          org,
          titles: normalize(titlesData.results || [])
        }
      }
    } catch (error) {
      console.error(error)
      return errorProps(`${noun} data is temporarily unavailable. Please try again later.`)
    }
  }
}

export default function OrgPage(props: OrgPageProps) {
  if ('error' in props) {
    return <DetailErrorView title={`${CONFIG[props.kind].noun} unavailable`} message={props.error} />
  }
  return <OrgContent kind={props.kind} org={props.org} titles={props.titles} />
}

function OrgContent({ kind, org, titles }: { kind: OrgKind; org: TmdbCompany; titles: TitleSummary[] }) {
  const { basePath, crumbRoot, accent, titleSuffix, ogLabel, releasesHeading, emptyText, fallbackDescription } = CONFIG[kind]
  const logoUrl = tmdbImage(org.logo_path)
  const [hasLogoError, setHasLogoError] = useState(false)
  const canonicalUrl = `${SITE_URL}${basePath}/${org.id}`
  const description = org.description || fallbackDescription(org.name)
  const ogSubtitle = org.headquarters ? `${org.headquarters} · ${ogLabel}` : `${ogLabel} · Galaxy Movies`
  const pageTitle = `${org.name}${titleSuffix}`

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    description,
    url: org.homepage || canonicalUrl,
    logo: logoUrl,
    foundingLocation: org.headquarters
      ? { '@type': 'Place', name: org.headquarters }
      : undefined,
    address: org.origin_country
      ? { '@type': 'PostalAddress', addressCountry: org.origin_country }
      : undefined
  }

  return (
    <>
      <PageHead
        title={pageTitle}
        description={description}
        canonicalUrl={canonicalUrl}
        ogSubtitle={ogSubtitle}
        posterPath={org.logo_path}
        structuredData={structuredData}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: crumbRoot.name, url: `${SITE_URL}${crumbRoot.path}` },
          { name: org.name, url: canonicalUrl }
        ]}
      />

      <Box position='relative' minH='100vh' bg='transparent' color='white' py={{ base: 8, md: 12 }} pt={{ base: 14, md: 16 }} px={{ base: 4, md: 12 }}>
        <BottomBackdrop />
        <Box maxW='1200px' mx='auto' position='relative' zIndex={1}>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'center', md: 'flex-start' }}
            gap={8}
            p={{ base: 6, md: 8 }}
            mb={6}
            w='fit-content'
            maxW='100%'
            mx='auto'
          >
            {logoUrl && !hasLogoError ? (
              <Box
                position='relative'
                w='200px'
                h='120px'
                flexShrink={0}
                bg='white'
                p={4}
                borderRadius='sm'
                display='flex'
                alignItems='center'
                justifyContent='center'
              >
                <Image
                  src={logoUrl}
                  alt={`${org.name} logo`}
                  fill
                  priority
                  sizes='200px'
                  onError={() => setHasLogoError(true)}
                  style={{ objectFit: 'contain', padding: '0.5rem' }}
                  unoptimized={logoUrl.startsWith('/')}
                />
              </Box>
            ) : (
              <Flex
                w='200px'
                h='120px'
                flexShrink={0}
                bg='whiteAlpha.200'
                borderRadius='0.5rem'
                align='center'
                justify='center'
                textAlign='center'
                p={4}
              >
                <Text fontWeight='bold' color='gray.300'>{org.name}</Text>
              </Flex>
            )}

            <Flex direction='column' gap={3} textAlign={{ base: 'center', md: 'left' }} flex={1}>
              <Heading size='xl'>{org.name}</Heading>

              <Flex direction='column' gap={2} align={{ base: 'center', md: 'flex-start' }}>
                <Flex gap={3} justify={{ base: 'center', md: 'flex-start' }} wrap='wrap' align='center'>
                  {org.origin_country && (
                    <Badge colorPalette={accent} fontSize='xs' px={2.5} py={1} borderRadius='md'>
                      {org.origin_country}
                    </Badge>
                  )}
                  {org.headquarters && (
                    <Text fontSize='sm' color='gray.400'>
                      📍 {org.headquarters}
                    </Text>
                  )}
                </Flex>

                {/^https?:\/\//i.test(org.homepage || '') && (
                  <ChakraLink
                    href={org.homepage}
                    fontSize='sm'
                    color={`${accent}.300`}
                    display='inline-flex'
                    alignItems='center'
                    gap={1}
                    _hover={{ textDecoration: 'underline' }}
                    target='_blank'
                    rel='noopener noreferrer'>
                    Official Website <Icon mx='2px' asChild><LuExternalLink /></Icon>
                  </ChakraLink>
                )}
              </Flex>

              {org.description && (
                <Text color='gray.300' fontSize='md' mt={2}>
                  {org.description}
                </Text>
              )}
            </Flex>
          </Flex>

          <Flex justify='center' gap={10} mb={10}>
            <BackButton />
          </Flex>

          <Flex justify='center' mb={6}>
            <Heading size='lg'>
              {releasesHeading}
            </Heading>
          </Flex>

          {titles.length === 0 ? (
            <Text color='gray.400' textAlign='center'>{emptyText}</Text>
          ) : (
            <MovieGrid movies={titles} />
          )}
        </Box>
      </Box>
    </>
  );
}
