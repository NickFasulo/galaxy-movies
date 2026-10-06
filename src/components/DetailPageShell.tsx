import type { ReactNode } from 'react'
import Image from 'next/image'
import { Box, Flex } from '@chakra-ui/react';
import TopBackdrop from './TopBackdrop'

const SIDE_VIGNETTE = 'linear-gradient(to right, #14181c 0%, transparent 20%, transparent 80%, #14181c 100%)'
const DESKTOP_OVERLAY = 'linear-gradient(to bottom, rgba(20,24,28,0.35) 0%, rgba(20,24,28,0.8) 60%, #14181c 100%)'

export default function DetailPageShell({
  backdropSrc,
  backdropAlt,
  onBackdropError,
  sidebar,
  children
}: {
  backdropSrc: string
  backdropAlt: string
  onBackdropError: () => void
  sidebar: ReactNode
  children: ReactNode
}) {
  return (
    <Box position='relative' minH='100vh' bg='#14181c' overflow='hidden'>
      <TopBackdrop display={{ base: 'block', md: 'none' }} zIndex={0} />
      <Box
        position='absolute'
        top={{ base: 'auto', md: 0 }}
        bottom={{ base: 0, md: 'auto' }}
        left={0}
        right={0}
        h={{ base: 'min(400px, 56.25vw)', md: '500px' }}
        zIndex={0}
        display={{ base: backdropSrc === '/backdrop_fallback.webp' ? 'none' : 'block', md: 'block' }}
      >
        <Box
          position='relative'
          h='100%'
          w='100%'
          css={{
            '& img': {
              objectFit: 'cover',
              objectPosition: { base: 'center bottom', md: 'center 20%' },
              WebkitMaskImage: {
                base: 'linear-gradient(to top, transparent 0%, black 15%, black 55%, transparent 100%)',
                md: 'none'
              },
              maskImage: {
                base: 'linear-gradient(to top, transparent 0%, black 15%, black 55%, transparent 100%)',
                md: 'none'
              }
            }
          }}
        >
          {backdropSrc === '/backdrop_fallback.webp' ? (
            // eslint-disable-next-line @next/next/no-img-element -- raw srcSet fallback; next/image can't emit this markup
            <img
              src='/backdrop_fallback_lg.webp'
              srcSet='/backdrop_fallback.webp 1376w, /backdrop_fallback_lg.webp 2560w'
              sizes='100vw'
              alt={backdropAlt}
              // React 18.2 doesn't recognize camelCase fetchPriority; the lowercase attribute passes through as-is.
              {...{ fetchpriority: 'high' }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          ) : (
            <Image
              src={backdropSrc}
              alt={backdropAlt}
              fill
              priority
              sizes='100vw'
              onError={onBackdropError}
            />
          )}
        </Box>
        <Box
          position='absolute'
          inset={0}
          bgImage={{
            base: 'linear-gradient(to top, #14181c 0%, #14181c 10%, rgba(20,24,28,0.35) 60%, rgba(20,24,28,0.85) 100%)',
            md: DESKTOP_OVERLAY
          }}
        />
        <Box
          position='absolute'
          inset={0}
          bgImage={SIDE_VIGNETTE}
        />
      </Box>
      <Box
        display={{ base: 'none', md: 'block' }}
        position='absolute'
        bottom={0}
        left={0}
        right={0}
        h='18rem'
        zIndex={0}
        pointerEvents='none'
      >
        <Box
          position='absolute'
          inset={0}
          bgImage="url('/backdrop_fallback_lg.webp')"
          bgSize='cover'
          bgPos='center'
          css={{
            WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 20%, black 55%, transparent 100%)',
            maskImage: 'linear-gradient(to top, transparent 0%, black 20%, black 55%, transparent 100%)'
          }}
        />
        <Box
          position='absolute'
          inset={0}
          bgImage={DESKTOP_OVERLAY}
        />
        <Box
          position='absolute'
          inset={0}
          bgImage={SIDE_VIGNETTE}
        />
      </Box>

      <Flex position='relative' zIndex={1} justify='center' align='flex-start' minH='100vh' pt={{ base: '6rem', md: '12rem' }} pb={{ base: '2rem', md: '4rem' }}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'center', md: 'flex-start' }} justify='center' maxW='1200px' w='100%' px='1rem' gap={{ base: '1.5rem', md: '2.5rem' }}>

          <Flex align='center' direction='column' position={{ base: 'relative', md: 'sticky' }} top={{ md: '2rem' }} w='20rem' flexShrink={0} gap='1rem'>
            {sidebar}
          </Flex>

          <Flex direction='column' w={{ base: '20rem', md: '40rem' }} maxW='100%' gap='1rem'>
            {children}
          </Flex>

        </Flex>
      </Flex>
    </Box>
  );
}
