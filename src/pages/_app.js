import { useState } from 'react'
// import { ReactQueryDevtools } from 'react-query/devtools'
import { Hydrate, QueryClient, QueryClientProvider } from 'react-query'
import { ChakraProvider } from '@chakra-ui/react'

function MyApp({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient())
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
