import type { ComponentProps } from 'react'
import { Input } from '@chakra-ui/react'

// iOS Safari auto-zooms inputs under 16px on focus — base size stays 16px.
export default function DarkInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      fontSize={{ base: '16px', md: 'sm' }}
      bg='blackAlpha.400'
      borderColor='border.subtle'
      color='white'
      {...props}
    />
  )
}
