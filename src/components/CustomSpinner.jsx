import { Spinner, Center } from '@chakra-ui/react'

export default function CustomSpinner({ height = '100vh' }) {
  return (
    <Center h={height}>
      <Spinner
        thickness='4px'
        emptyColor='gray.200'
        color='green.500'
        size='xl'
      />
    </Center>
  )
}
