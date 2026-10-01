import { useMemo, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Hydrate, QueryClient, QueryClientProvider } from 'react-query'
import { ChakraProvider } from '@chakra-ui/react'
import { Analytics } from '@vercel/analytics/react'
import { useScrollRestore } from '../hooks/useScrollRestore'
import { tiun } from '@tiun/sdk'
import ChatWidget from '../components/ChatWidget'
import Header from '../components/Header'
import Footer from '../components/Footer'
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  const queryClient = useMemo(() => new QueryClient(), [])
  const router = useRouter()
  const isHome = router.pathname === '/'
  const isDark = /^\/(movies|person|company)\//.test(router.pathname)

  useScrollRestore()

  useEffect(() => {
    tiun.init({
      snippetId: '8DpSIcwNMglV5Rh9FZlygzxprSzvMosIOLu4jcu6',
      language: 'en'
    })
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <ChakraProvider>
          <Head>
            <meta name='viewport' content='width=device-width, initial-scale=1' />
          </Head>
          <Header isHome={isHome} isDark={isDark} />
          <Component {...pageProps} />
          {!isHome && <Footer isDark={isDark} />}
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
