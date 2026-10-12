import NextLink from 'next/link'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import LegalLinks from './LegalLinks'

// The nav row exists so every non-home page offers onward paths — without it,
// listing/SEO pages are dead ends for both visitors and crawlers. Excluded on
// the homepage in _app — its infinite scroll has no stable "bottom" for an
// in-flow footer, so it uses its own fixed legal pill instead.
const NAV_LINKS = [
  { href: '/streaming', label: 'Streaming' },
  { href: '/tv', label: 'TV Shows' },
  { href: '/genre', label: 'Genres' },
  { href: '/browse', label: 'Browse' },
  { href: '/lists', label: 'Lists' },
  { href: '/collections', label: 'Collections' },
  { href: '/free', label: 'Free to Watch' },
  { href: '/new-on-streaming', label: 'New Releases' },
  { href: '/streaming-in-india', label: 'India Streaming Guide' },
  { href: '/justwatch-alternative', label: 'JustWatch Alternative' },
  { href: '/email-status', label: 'Email Status' }
]

export default function Footer({ isDark = false }) {
  // renders outside the page's own Box, so match the dark background explicitly
  const bg = isDark ? 'surface.canvas' : 'transparent'

  return (
    <Box as='footer' bg={bg} mt='auto' pb={1}>
      <Flex as='nav' aria-label='Site' justify='center' wrap='wrap' gap={{ base: 3, md: 5 }} pt={4} px={4}>
        {NAV_LINKS.map((item) => (
          <Link
            key={item.href}
            asChild
            color='gray.400'
            fontSize='xs'
            transition='color 0.15s'
            _hover={{ color: 'white' }}>
            <NextLink href={item.href}>{item.label}</NextLink>
          </Link>
        ))}
      </Flex>
      <Text textAlign='center' py={4}>
        <LegalLinks />
      </Text>
    </Box>
  )
}
