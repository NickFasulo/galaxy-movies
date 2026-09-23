import { useMemo } from 'react'
import { Hydrate, QueryClient, QueryClientProvider } from 'react-query'
import { ChakraProvider } from '@chakra-ui/react'
import { Analytics } from '@vercel/analytics/react'
import { useScrollRestore } from '../hooks/useScrollRestore'
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  const queryClient = useMemo(() => new QueryClient(), [])

  useScrollRestore()

  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <ChakraProvider>
          <Component {...pageProps} />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ChakraProvider>
      </Hydrate>
    </QueryClientProvider>
  )
}

export default MyApp
