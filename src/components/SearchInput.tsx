import type { ComponentProps } from 'react'
import { Input, useBreakpointValue } from '@chakra-ui/react'

// Canonical search-field styling — the homepage SearchBar is the reference.
// Layout props (size, width, flex) stay per-callsite.
export default function SearchInput(props: ComponentProps<typeof Input>) {
  const placeholder = useBreakpointValue({ base: 'Search...', md: 'Search movies & shows...' })
  return (
    <Input
      placeholder={placeholder}
      bg='surface.raised'
      color='white'
      borderColor='border.subtle'
      _placeholder={{ color: 'gray.400' }}
      {...props}
    />
  )
}
