import type { ReactNode } from 'react'
import { Box, Text, type BoxProps } from '@chakra-ui/react'

// The one dark surface card — panels across features share this spec.
export default function Panel({ title, children, ...rest }: BoxProps & { title?: ReactNode }) {
  return (
    <Box
      bg='blackAlpha.500'
      border='1px solid var(--chakra-colors-border-subtle)'
      borderRadius='lg'
      p={4}
      {...rest}
    >
      {title && (
        <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' mb={1}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  )
}
