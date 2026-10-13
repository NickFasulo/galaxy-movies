import { Box, Text } from '@chakra-ui/react'
import LegalLinks from './LegalLinks'

// Floating legal-links pill for infinite-scroll pages — an in-flow footer
// would sit below a feed that never ends (same pattern as the homepage).
export default function FooterPill() {
  return (
    <Box
      as='footer'
      position='fixed'
      bottom='0.5rem'
      left='0'
      right='0'
      mx='auto'
      zIndex={9}
      py='0.25rem'
      px='1rem'
      w='fit-content'
      bg='rgba(31, 37, 43, 0.72)'
      border='1px solid var(--chakra-colors-border-subtle)'
      borderRadius='full'
      backdropFilter='blur(10px)'
    >
      <Text textAlign='center'>
        <LegalLinks />
      </Text>
    </Box>
  )
}
