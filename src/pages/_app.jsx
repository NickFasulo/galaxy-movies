import { useMemo, useEffect } from 'react'
import { Hydrate, QueryClient, QueryClientProvider } from 'react-query'
import { ChakraProvider } from '@chakra-ui/react'
import { Analytics } from '@vercel/analytics/react'
import { useScrollRestore } from '../hooks/useScrollRestore'
import { tiun } from '@tiun/sdk'
import ChatWidget from '../components/ChatWidget'
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  const queryClient = useMemo(() => new QueryClient(), [])

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
          <Component {...pageProps} />
          <ChatWidget />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ChakraProvider>
      </Hydrate>
    </QueryClientProvider>
  )
}

export default MyApp
