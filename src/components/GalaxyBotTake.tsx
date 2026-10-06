import { Box, Text } from '@chakra-ui/react'

export default function GalaxyBotTake({ synopsis }: { synopsis?: string | null }) {
  if (!synopsis) return null

  return (
    <Box
      p={4}
      mt='1rem'
      bg='whiteAlpha.100'
      borderRadius='md'
      borderTop={{ base: '3px solid var(--chakra-colors-purple-400)', md: 'none' }}
      borderLeft={{ base: 'none', md: '3px solid var(--chakra-colors-purple-400)' }}
    >
      <Text
        fontSize='sm'
        fontWeight='semibold'
        color='white'
        mb={1}
        textAlign={{ base: 'center', md: 'left' }}
      >
        Galaxy Bot&apos;s Take
      </Text>
      <Text fontSize='sm' color='whiteAlpha.800'>
        {synopsis}
      </Text>
    </Box>
  )
}
