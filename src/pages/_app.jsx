import { useState } from 'react'
// import { ReactQueryDevtools } from 'react-query/devtools'
import { Hydrate, QueryClient, QueryClientProvider } from 'react-query'
import { ChakraProvider } from '@chakra-ui/react'
import { useScrollRestore } from '../hooks/useScrollRestore'
import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient())

  useScrollRestore()

  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <ChakraProvider>
          <Component {...pageProps} />
        </ChakraProvider>
        {/* <ReactQueryDevtools initialIsOpen={false}/> */}
      </Hydrate>
    </QueryClientProvider>
  )
}

export default MyApp
