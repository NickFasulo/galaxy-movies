import NextLink from 'next/link'
import { Box, Link, Text } from '@chakra-ui/react'

// Rendered site-wide from _app.jsx on every page except the homepage (which
// keeps its own fixed-position legal pill — its infinite scroll means "the
// bottom of the page" isn't a stable place a normal in-flow footer could sit).
// Text color is conditional on the page's background (isDark, for the
// full-bleed dark movie/person/company pages).
export default function Footer({ isDark = false }) {
  const textColor = isDark ? 'whiteAlpha.800' : 'gray.600'
  // Footer renders outside the page's own Box, so "transparent" would reveal
  // <body>'s white background rather than a dark page's actual color — match
  // it explicitly instead.
  const bg = isDark ? '#14181c' : 'transparent'

  return (
    <Box as='footer' bg={bg}>
      <Text textAlign='center' fontSize='sm' color={textColor} py={2}>
        <Link as={NextLink} href='/privacy'>Privacy</Link> ·{' '}
        <Link as={NextLink} href='/terms'>Terms</Link> ·{' '}
        <Link as={NextLink} href='/contact'>Contact</Link>
      </Text>
    </Box>
  )
}
