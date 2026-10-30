import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Box } from '@chakra-ui/react'

// Top-of-viewport navigation progress (the GitHub/YouTube pattern):
// routeChangeStart trickles toward 85%, done/error sweeps to 100% and fades.
// Inline spinners stay for in-place content loads — this bar only ever means
// "the page is navigating".
export default function RouteProgressBar() {
  const router = useRouter()
  const [target, setTarget] = useState<number | null>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const start = (url: string) => {
      if (url === router.asPath) return
      if (doneTimer.current) clearTimeout(doneTimer.current)
      setTarget(0)
      requestAnimationFrame(() => requestAnimationFrame(() => setTarget(85)))
    }
    const done = () => {
      setTarget((t) => (t === null ? null : 100))
      doneTimer.current = setTimeout(() => setTarget(null), 400)
    }
    router.events.on('routeChangeStart', start)
    router.events.on('routeChangeComplete', done)
    router.events.on('routeChangeError', done)
    return () => {
      router.events.off('routeChangeStart', start)
      router.events.off('routeChangeComplete', done)
      router.events.off('routeChangeError', done)
      if (doneTimer.current) clearTimeout(doneTimer.current)
    }
  }, [router])

  return (
    <Box
      position='fixed'
      top={0}
      left={0}
      right={0}
      h='2px'
      zIndex='tooltip'
      pointerEvents='none'
      opacity={target === null ? 0 : 1}
      transition='opacity 0.25s ease'
    >
      <Box
        h='100%'
        bg='brand.accent'
        boxShadow='0 0 4px rgba(100, 160, 255, 0.4)'
        style={{
          width: `${target ?? 0}%`,
          transition:
            target === 100
              ? 'width 0.15s ease-out'
              : target === null || target === 0
                ? 'none'
                : 'width 5s cubic-bezier(0.1, 0.45, 0.25, 1)'
        }}
      />
    </Box>
  )
}
