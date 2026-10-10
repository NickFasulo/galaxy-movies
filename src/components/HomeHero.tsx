import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Box, Flex, Heading, Text, Badge } from '@chakra-ui/react'
import { Tooltip } from './ui/tooltip'
import TopBackdrop from './TopBackdrop'
import Backdrop, { BACKDROP_OVERLAYS } from './Backdrop'
import WatchlistButton from './WatchlistButton'
import type { TitleSummary, WatchProvider } from '../types/tmdb'

const MAX_LOGOS = 5

// `dimmed` rides the same isBgVisible flag as the card-hover preview: when a
// hovered card's backdrop paints the viewport, the hero's art and text fade
// out so the hero reads as a preview of that card instead of stale content.
export default function HomeHero({ featured, providers, myProviderIds, dimmed, children }: {
  featured: TitleSummary | null
  providers: WatchProvider[]
  myProviderIds?: Set<number>
  dimmed: boolean
  children: ReactNode
}) {
  if (!featured) {
    return (
      <>
        <TopBackdrop
          top='-4.25rem'
          zIndex={0}
          opacity={dimmed ? 0 : 1}
          transition='opacity 0.6s ease-in-out'
          willChange='opacity'
        />
        {children}
      </>
    )
  }

  const isTv = featured.mediaType === 'tv'
  const href = isTv ? `/tv/${featured.id}` : `/movies/${featured.id}`
  const year = (featured.release_date || featured.first_air_date || '').slice(0, 4)
  const shownProviders = providers.slice(0, MAX_LOGOS)

  return (
    <>
      <Box position='absolute' top='-4.25rem' left={0} right={0} h={{ base: '26rem', md: '32rem' }} zIndex={0}>
        <Backdrop
          path={featured.backdrop_path}
          overlays={BACKDROP_OVERLAYS.topBand}
          imagePosition='center 25%'
          priority
          opacity={dimmed ? 0 : 1}
          transition='opacity 0.6s ease-in-out'
          willChange='opacity'
        />
      </Box>

      <Box position='relative' h={{ base: '21.75rem', md: '27.75rem' }}>
        {children}
        <Flex
          position='absolute'
          bottom='1.5rem'
          left={0}
          right={0}
          justify='center'
          opacity={dimmed ? 0 : 1}
          transition='opacity 0.4s ease-in-out'
          pointerEvents={dimmed ? 'none' : 'auto'}
        >
          <Box mx={{ base: '1.5rem', md: '3rem', xl: 'auto' }} w='100%' maxW={{ xl: '80rem' }}>
            <Text fontSize='2xs' color='gray.300' letterSpacing='0.22em' textTransform='uppercase' mb={1}>
              #1 Trending this week
            </Text>
            <Flex align='center' gap={3} wrap='wrap'>
              <Heading as='h2' fontSize={{ base: 'xl', md: '3xl' }} lineHeight={1.15} fontWeight='bold'>
                <Link href={href}>{featured.title || featured.name}</Link>
              </Heading>
              {isTv && <Badge colorPalette='purple' fontSize='2xs'>TV</Badge>}
              <WatchlistButton movie={featured} />
            </Flex>
            <Flex align='center' gap={3} mt={2} wrap='wrap'>
              <Text fontSize='xs' color='gray.300'>
                {[year, featured.vote_average ? `★ ${featured.vote_average.toFixed(1)}` : null].filter(Boolean).join(' · ')}
              </Text>
              {shownProviders.length > 0 && (
                <Flex align='center' gap={1.5}>
                  <Text fontSize='2xs' color='gray.400' mr={0.5}>Streaming on</Text>
                  {shownProviders.map((provider) => (
                    <Tooltip key={provider.provider_id} content={provider.provider_name} showArrow positioning={{ placement: 'top' }}>
                      <Box
                        position='relative'
                        w={{ base: '24px', md: '28px' }}
                        h={{ base: '24px', md: '28px' }}
                        borderRadius='0.375rem'
                        overflow='hidden'
                        boxShadow={myProviderIds?.has(provider.provider_id) ? '0 0 0 1.5px var(--chakra-colors-green-300)' : undefined}
                      >
                        <Image
                          src={provider.logo_path}
                          alt={provider.provider_name}
                          fill
                          sizes='28px'
                          style={{ objectFit: 'cover' }}
                        />
                      </Box>
                    </Tooltip>
                  ))}
                </Flex>
              )}
            </Flex>
          </Box>
        </Flex>
      </Box>
    </>
  )
}
