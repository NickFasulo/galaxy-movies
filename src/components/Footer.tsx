import NextLink from 'next/link'
import { Box, Link, Text } from '@chakra-ui/react'

// Excluded on the homepage in _app.jsx — its infinite scroll has no stable
// "bottom" for an in-flow footer, so it uses its own fixed legal pill instead.
export default function Footer({ isDark = false }) {
  // renders outside the page's own Box, so match the dark background explicitly
  const bg = isDark ? '#14181c' : 'transparent'

  return (
    <Box as='footer' bg={bg} mt='auto'>
      <Text textAlign='center' fontSize='sm' color='whiteAlpha.900' py={2}>
        <Link as={NextLink} href='/privacy'>Privacy</Link> ·{' '}
        <Link as={NextLink} href='/terms'>Terms</Link> ·{' '}
        <Link as={NextLink} href='/contact'>Contact</Link>
      </Text>
    </Box>
  )
}
