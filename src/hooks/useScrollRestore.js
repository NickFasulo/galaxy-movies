import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'

export const useScrollRestore = () => {
  const router = useRouter()

  const scrollPositions = useRef({})
  const isBack = useRef(false)

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    router.beforePopState(() => {
      isBack.current = true
      return true
    })

    const onRouteChangeStart = () => {
      const url = router.asPath
      // Exclude the homepage '/' as it handles its own scroll restoration
      if (url !== '/') {
        scrollPositions.current[url] = window.scrollY
      }
    }

    const onRouteChangeComplete = url => {
      if (url !== '/' && isBack.current && scrollPositions.current[url]) {
        setTimeout(() => {
          window.scrollTo({
            top: scrollPositions.current[url],
            behavior: 'auto'
          })
        }, 0)
      }

      isBack.current = false
    }

    router.events.on('routeChangeStart', onRouteChangeStart)
    router.events.on('routeChangeComplete', onRouteChangeComplete)

    return () => {
      router.events.off('routeChangeStart', onRouteChangeStart)
      router.events.off('routeChangeComplete', onRouteChangeComplete)
    }
  }, [router])
}
