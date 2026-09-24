import { useState, useRef, useCallback, useEffect } from 'react'
import { Box } from '@chakra-ui/react'

export function useHoverBackground() {
  const [hoveredBg, setHoveredBg] = useState(null)
  const [isBgVisible, setIsBgVisible] = useState(false)
  const hoverTimerRef = useRef(null)

  const handleCardMouseEnter = useCallback((backdropPath) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (!backdropPath) return

    hoverTimerRef.current = setTimeout(() => {
      setHoveredBg(backdropPath)
      setIsBgVisible(true)
    }, 750)
  }, [])

  const handleCardMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setIsBgVisible(false)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  return {
    hoveredBg,
    isBgVisible,
    handleCardMouseEnter,
    handleCardMouseLeave
  }
}

export default function HoverBackground({ hoveredBg, isBgVisible }) {
  const backgroundImage = hoveredBg ? `url(https://image.tmdb.org/t/p/w1280${hoveredBg})` : 'none'
  
  return (
    <Box
      display={{ base: 'none', md: 'block' }}
      position='fixed'
      top={0}
      left={0}
      w='100vw'
      h='100vh'
      zIndex={0}
      pointerEvents='none'
      opacity={isBgVisible && hoveredBg ? 0.25 : 0}
      transition='opacity 0.6s ease-in-out'
      bgImage={backgroundImage}
      bgPosition='center'
      bgSize='cover'
      bgRepeat='no-repeat'
      _after={{
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgGradient: 'radial(circle, transparent 20%, #14181c 90%)'
      }}
    />
  )
}