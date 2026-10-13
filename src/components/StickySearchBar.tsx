import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Box } from '@chakra-ui/react'

// Sticky shell matching the homepage SearchBar: transparent at rest, gains the
// blurred translucent background + subtle border once scrolled past its offset.
export default function StickySearchBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isSticky, setIsSticky] = useState(false)
  const [barTop, setBarTop] = useState(0)

  useEffect(() => {
    if (ref.current) {
      setBarTop(ref.current.getBoundingClientRect().top + window.scrollY)
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => setIsSticky(window.scrollY > barTop)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [barTop])

  return (
    <Box
      ref={ref}
      position='sticky'
      top={0}
      zIndex={20}
      background={isSticky ? 'rgba(20,24,28,0.88)' : 'transparent'}
      backdropFilter={isSticky ? 'blur(12px)' : 'none'}
      borderBottom='1px solid'
      borderColor={isSticky ? 'border.subtle' : 'transparent'}
      transition='background 0.2s ease-in-out, border-color 0.2s ease-in-out'
    >
      {children}
    </Box>
  )
}
