import type { ReactNode } from 'react'
import { Box, Heading, Text } from '@chakra-ui/react'
import BackButton from './BackButton'

export default function PageShell({
  title,
  description,
  maxW = '70rem',
  pb,
  withBackButton = false,
  children
}: {
  title?: string
  description?: string
  maxW?: string
  pb?: number | string | Record<string, number | string>
  withBackButton?: boolean
  children?: ReactNode
}) {
  return (
    <Box flex='1' bg='transparent' color='white' pt={{ base: '5em', md: '6rem' }} pb={pb ?? { base: 6, md: 10 }}>
      <Box maxW={maxW} mx='auto' px={6}>
        {title && <Heading as='h1' textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>}
        {description && <Text maxW='42rem' mt={3} color='gray.400'>{description}</Text>}
        {children}
        {withBackButton && (
          <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
            <BackButton />
          </Box>
        )}
      </Box>
    </Box>
  );
}
