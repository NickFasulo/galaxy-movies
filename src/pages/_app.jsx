import { useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Hydrate, QueryClient, QueryClientProvider } from 'react-query'
import { ChakraProvider, Flex, Box } from '@chakra-ui/react'
import { Analytics } from '@vercel/analytics/react'
import { useScrollRestore } from '../hooks/useScrollRestore'
import ChatWidget from '../components/ChatWidget'
import Header from '../components/Header'
import Footer from '../components/Footer'
import TopBackdrop from '../components/TopBackdrop'
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  const queryClient = useMemo(() => new QueryClient(), [])
  const router = useRouter()
  const isHome = router.pathname === '/'
  const isDark = /^\/(movies\/|person\/|company\/|network\/|about$|privacy$|terms$|contact$|disclosure$|streaming-in-india$|justwatch-alternative$|404$|streaming|tv|lists|collections|free$|new-on-streaming|genre\/|browse\/|watchlist$|email-status$|$)/.test(router.pathname)
  const showTopBackdrop = isDark && !isHome && !router.pathname.startsWith('/movies/') && router.pathname !== '/tv/[showId]'

  useScrollRestore()

  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <ChakraProvider>
          <Head>
            <meta name='viewport' content='width=device-width, initial-scale=1' />
          </Head>
          <Flex direction='column' minH='100vh' position='relative' bg={isDark ? '#14181c' : undefined}>
            {showTopBackdrop && <TopBackdrop />}
            <Header isHome={isHome} isDark={isDark} />
            <Box position='relative' zIndex={1} flex='1' display='flex' flexDirection='column'>
              <Component {...pageProps} />
            </Box>
            {!isHome && <Footer isDark={isDark} />}
          </Flex>
          <ChatWidget />
          {process.env.NODE_ENV === 'production' && (
            <Analytics
              beforeSend={(event) => {
                if (localStorage.getItem('disableAnalytics') === 'true') {
                  return null
                }

                return event
              }}
            />
          )}
        </ChakraProvider>
      </Hydrate>
    </QueryClientProvider>
  )
}

export default MyApp
