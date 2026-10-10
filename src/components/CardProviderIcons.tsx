import Image from 'next/image'
import { Box, Flex, Text } from '@chakra-ui/react'
import type { WatchProvider } from '../types/tmdb'

const MAX_ICONS = 3

// Flatrate provider logos for a card; ones matching the user's services get
// the same green ring used elsewhere for "this is on one of my services".
export default function CardProviderIcons({ providers, myProviderIds }: {
  providers: WatchProvider[]
  myProviderIds: Set<number>
}) {
  if (providers.length === 0) return null
  const shown = providers.slice(0, MAX_ICONS)
  const extra = providers.length - shown.length

  return (
    <Flex
      gap={1}
      align='center'
      bg='rgba(20, 24, 28, 0.8)'
      border='1px solid var(--chakra-colors-border-subtle)'
      borderRadius='md'
      px={1}
      py={0.5}
    >
      {shown.map((provider) => (
        <Box
          key={provider.provider_id}
          position='relative'
          w='20px'
          h='20px'
          borderRadius='0.25rem'
          overflow='hidden'
          boxShadow={myProviderIds.has(provider.provider_id) ? '0 0 0 1.5px var(--chakra-colors-green-300)' : undefined}
        >
          <Image
            src={provider.logo_path}
            alt={provider.provider_name}
            fill
            sizes='20px'
            style={{ objectFit: 'cover' }}
          />
        </Box>
      ))}
      {extra > 0 && (
        <Text fontSize='2xs' color='gray.300' lineHeight={1}>+{extra}</Text>
      )}
    </Flex>
  )
}
