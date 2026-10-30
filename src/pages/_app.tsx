import { useMemo } from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import Script from 'next/script'
import { useRouter } from 'next/router'
import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query'
import { Flex, Box } from '@chakra-ui/react'
import { Provider } from '../components/ui/provider'
import { useScrollRestore } from '../hooks/useScrollRestore'
import { useAlertsSync } from '../features/alerts/hooks/useAlertsSync'
import ChatWidget from '../features/ai/components/ChatWidget'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { FooterPill } from '../components/Footer'
import { TopBackdrop } from '../components/Backdrop'
import RouteProgressBar from '../components/RouteProgressBar'
import '../styles/globals.css'

function MyApp({ Component, pageProps }: AppProps<{ dehydratedState?: DehydratedState }>) {
  const router = useRouter()
  // Embed pages are iframed on third-party sites: no app chrome, no react-query,
  // and none of the localStorage-touching hooks (those can throw in blocked
  // third-party contexts) — just the Chakra provider so theming still works.
  if (router.pathname.startsWith('/embed/')) {
    return (
      <Provider forcedTheme='dark'>
        <Head>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
        </Head>
        <Component {...pageProps} />
      </Provider>
    )
  }
  return <MainApp Component={Component} pageProps={pageProps} />
}

function MainApp({ Component, pageProps }: Pick<AppProps<{ dehydratedState?: DehydratedState }>, 'Component' | 'pageProps'>) {
  const queryClient = useMemo(() => new QueryClient(), [])
  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '2c6d34d1-558e-45d3-bdb3-dc1b4f66c6a4'
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC ?? '/assets/starfield.js'
  const router = useRouter()
  const isHome = router.pathname === '/'
  // Pages whose main feed is infinite-scroll — an in-flow footer is
  // unreachable below an endless feed, so they get the floating pill instead.
  const hasInfiniteScroll = /^\/($|search$|browse\/.|genre\/.|tv\/(browse|genre|streaming)\/.|streaming\/.|company\/.|network\/.)/.test(router.pathname)
  const isDark = /^\/(movies\/|person\/|company\/|network\/|about$|privacy$|terms$|contact$|disclosure$|streaming-in-india$|justwatch-alternative$|404$|streaming|tv|lists?|collections|free$|new-on-streaming|leaving|this-month|anime$|genre|browse|watchlist$|plus$|email-status$|widgets$|search$|usage$|$)/.test(router.pathname)
  // /plus mounts its own taller galaxy band instead of the shared TopBackdrop
  const showTopBackdrop = isDark && !isHome && !router.pathname.startsWith('/movies/') && router.pathname !== '/tv/[showId]' && router.pathname !== '/plus'

  useScrollRestore()
  useAlertsSync()

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={pageProps.dehydratedState}>
        <Provider forcedTheme='dark'>
          <Head>
            <meta name='viewport' content='width=device-width, initial-scale=1' />
          </Head>
          <RouteProgressBar />
          <Flex direction='column' minH='100dvh' position='relative' bg={isDark ? 'surface.canvas' : undefined}>
            {showTopBackdrop && <TopBackdrop />}
            <Header isHome={isHome} isDark={isDark} hideSearch={router.pathname === '/search'} />
            <Box position='relative' zIndex={1} flex='1' display='flex' flexDirection='column'>
              <Component {...pageProps} />
            </Box>
            {hasInfiniteScroll ? <FooterPill /> : (!isHome && <Footer isDark={isDark} />)}
          </Flex>
          <ChatWidget />
          {umamiWebsiteId && (
            <Script
              src={umamiSrc}
              data-website-id={umamiWebsiteId}
              data-host-url={umamiSrc.startsWith('/') ? '/starfield' : undefined}
              data-domains='galaxymovies.app,www.galaxymovies.app'
              strategy='afterInteractive'
            />
          )}
        </Provider>
      </HydrationBoundary>
    </QueryClientProvider>
  )
}

export default MyApp
