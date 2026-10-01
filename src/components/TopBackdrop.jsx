import { Box } from '@chakra-ui/react'

export default function TopBackdrop(props) {
  return (
    <Box
      position='absolute'
      top={0}
      left={0}
      right={0}
      h={{ base: '14rem', md: '22rem' }}
      pointerEvents='none'
      bgImage="url('/backdrop_fallback.webp')"
      bgSize='cover'
      bgPosition='center 20%'
      _before={{
        content: '""',
        position: 'absolute',
        inset: 0,
        bgGradient: 'linear(to-b, transparent 0%, rgba(20,24,28,0.55) 55%, #14181c 100%)'
      }}
      _after={{
        content: '""',
        position: 'absolute',
        inset: 0,
        bgGradient: 'radial(ellipse 120% 100% at 50% 0%, transparent 40%, rgba(20,24,28,0.9) 100%)'
      }}
      {...props}
    />
  )
}
