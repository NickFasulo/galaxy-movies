import type { ComponentProps } from 'react'
import { Badge } from '@chakra-ui/react'

// The one poster-overlay badge spec — same sizing on every MovieCard badge.
export default function CardBadge({ children, ...rest }: ComponentProps<typeof Badge>) {
  return (
    <Badge fontSize='2xs' px={1.5} py={0.5} borderRadius='md' {...rest}>
      {children}
    </Badge>
  )
}
