import Image from 'next/image'
import Link from 'next/link'
import { Box, Flex, Text } from '@chakra-ui/react'
import { Tooltip } from './ui/tooltip'
import { useUserData } from '../hooks/useUserData'
import { setServices } from '../utils/userData'
import { streamingProviders, getProviderId, isProviderAvailableInRegion } from '../utils/tmdb'
import type { WatchProvider } from '../types/tmdb'

// Selecting a logo marks it as one of the user's subscriptions (persisted via
// setServices) and filters the feed below to titles streaming on those services.
export default function ProviderBar({ catalog }: { catalog: Map<number, WatchProvider> | undefined }) {
  const { services } = useUserData()
  const { region, providers } = services

  const entries = Object.entries(streamingProviders)
    .filter(([key]) => isProviderAvailableInRegion(key, region))
    .map(([key, def]) => ({ key, id: getProviderId(key, region), name: def.title.replace(' Movies', '') }))
    .filter((entry): entry is { key: string; id: number; name: string } => entry.id != null)

  const toggle = (key: string) => {
    setServices(region, providers.includes(key) ? providers.filter((k) => k !== key) : [...providers, key])
  }

  return (
    <Box mx={{ base: '1.5rem', md: '3rem', xl: 'auto' }} maxW={{ xl: '80rem' }} mt='1.75rem'>
      <Flex align='baseline' justify='space-between' gap={3}>
        <Text fontSize='xs' fontWeight='bold' letterSpacing='0.12em' textTransform='uppercase' color='gray.400'>
          My services
        </Text>
        <Link href='/streaming' style={{ fontSize: 'var(--chakra-font-sizes-xs)', color: 'var(--chakra-colors-gray-400)' }}>
          Browse all services
        </Link>
      </Flex>
      <Flex mt={1} gap={{ base: 3, md: 4 }} overflowX='auto' mx='-0.5rem' px='0.5rem' py='0.5rem' role='group' aria-label='Your streaming services'>
        {entries.map(({ key, id, name }) => {
          const selected = providers.includes(key)
          const logo = catalog?.get(id)?.logo_path
          return (
            <Tooltip key={key} content={name} showArrow positioning={{ placement: 'top' }}>
              <Box
                as='button'
                aria-pressed={selected}
                aria-label={name}
                onClick={() => toggle(key)}
                position='relative'
                w={{ base: '44px', md: '52px' }}
                h={{ base: '44px', md: '52px' }}
                flexShrink={0}
                borderRadius='0.75rem'
                overflow='hidden'
                cursor='pointer'
                transition='transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease'
                filter={selected ? 'none' : 'grayscale(0.7)'}
                opacity={selected ? 1 : 0.7}
                boxShadow={selected ? '0 0 0 2px var(--chakra-colors-green-300)' : '0 0 0 1px var(--chakra-colors-border-subtle)'}
                _hover={{ transform: 'scale(1.06)', opacity: 1, filter: 'none' }}
              >
                {logo ? (
                  <Image src={logo} alt={name} fill sizes='52px' style={{ objectFit: 'cover' }} />
                ) : (
                  <Flex h='100%' align='center' justify='center' bg='surface.raised' px={1}>
                    <Text fontSize='2xs' color='gray.200' textAlign='center' lineClamp={2}>{name}</Text>
                  </Flex>
                )}
              </Box>
            </Tooltip>
          )
        })}
      </Flex>
    </Box>
  )
}
