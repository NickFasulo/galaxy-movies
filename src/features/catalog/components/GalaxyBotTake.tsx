import { Box, Text } from '@chakra-ui/react'

// The model wraps titles in *asterisks* — render them as real emphasis instead
// of showing the markers. Unbalanced markers stay literal.
function withEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((seg, i) => {
    if (/^\*\*[^*]+\*\*$/.test(seg)) return <Text as='span' fontWeight='bold' key={i}>{seg.slice(2, -2)}</Text>
    if (/^\*[^*]+\*$/.test(seg)) return <em key={i}>{seg.slice(1, -1)}</em>
    return seg
  })
}

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
        {withEmphasis(synopsis)}
      </Text>
    </Box>
  )
}
