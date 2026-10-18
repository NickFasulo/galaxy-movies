import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Box, Flex } from '@chakra-ui/react';
import { TopBackdrop } from '../../../components/Backdrop'
import Backdrop, { BACKDROP_OVERLAYS } from '../../../components/Backdrop'

export default function DetailPageShell({
  backdropPath,
  backdropAlt,
  sidebar,
  children
}: {
  backdropPath: string | null
  backdropAlt: string
  sidebar: ReactNode
  children: ReactNode
}) {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [stickyTop, setStickyTop] = useState('2rem')

  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    // A sidebar taller than the viewport can't fully show while stuck at a
    // fixed top offset — anchor it by its bottom edge so page scroll reaches the tail.
    const update = () => setStickyTop(`${Math.min(32, window.innerHeight - el.offsetHeight - 16)}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <Box position='relative' minH='100vh' bg='surface.canvas' overflow='hidden'>
      <TopBackdrop display={{ base: 'block', md: 'none' }} zIndex={0} />
      <Backdrop
        path={backdropPath}
        alt={backdropAlt}
        priority
        overlays={BACKDROP_OVERLAYS.detailHero}
        imagePosition={{ base: 'center bottom', md: 'center 20%' }}
        imageMask={{ base: 'linear-gradient(to top, transparent 0%, black 15%, black 55%, transparent 100%)', md: 'none' }}
        top={{ base: 'auto', md: 0 }}
        bottom={{ base: 0, md: 'auto' }}
        h={{ base: 'min(400px, 56.25vw)', md: '500px' }}
        display={{ base: backdropPath ? 'block' : 'none', md: 'block' }}
        zIndex={0}
      />

      <Flex position='relative' zIndex={1} justify='center' align='flex-start' minH='100vh' pt={{ base: '6rem', md: '12rem' }} pb={{ base: '2rem', md: '4rem' }}>
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'center', md: 'flex-start' }} justify='center' maxW='1200px' w='100%' px='1rem' gap={{ base: '1.5rem', md: '2.5rem' }}>

          <Flex ref={sidebarRef} align='center' direction='column' position={{ base: 'relative', md: 'sticky' }} top={{ md: stickyTop }} w='20rem' flexShrink={0} gap='1rem'>
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
