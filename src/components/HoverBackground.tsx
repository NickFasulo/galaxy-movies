import { useState, useRef, useCallback, useEffect } from 'react'
import Backdrop, { BACKDROP_OVERLAYS } from './Backdrop'

export function useHoverBackground() {
  const [hoveredBg, setHoveredBg] = useState<string | null>(null)
  const [isBgVisible, setIsBgVisible] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCardMouseEnter = useCallback((backdropPath: string | null | undefined) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (!backdropPath) return

    hoverTimerRef.current = setTimeout(() => {
      setHoveredBg(backdropPath)
      setIsBgVisible(true)
    }, 500)
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

export default function HoverBackground({ hoveredBg, isBgVisible }: { hoveredBg: string | null; isBgVisible: boolean }) {
  if (!hoveredBg) return null

  return (
    <Backdrop
      path={hoveredBg}
      overlays={BACKDROP_OVERLAYS.viewport}
      imagePosition='center'
      imageSizes='1280px'
      position='fixed'
      display={{ base: 'none', md: 'block' }}
      opacity={isBgVisible ? 0.30 : 0}
      transition='opacity 0.6s ease-in-out'
      zIndex={0}
    />
  )
}
