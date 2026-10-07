import { type BoxProps } from '@chakra-ui/react'
import Backdrop, { BACKDROP_OVERLAYS } from './Backdrop'

export default function TopBackdrop(props: BoxProps) {
  return (
    <Backdrop
      path={null}
      overlays={BACKDROP_OVERLAYS.topBand}
      priority
      bottom='auto'
      h={{ base: '14rem', md: '22rem' }}
      {...props}
    />
  )
}
