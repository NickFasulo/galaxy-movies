import { Spinner, Center } from '@chakra-ui/react'

export default function CustomSpinner() {
  return (
    <Center h='100vh'>
      <Spinner
        thickness='4px'
        emptyColor='gray.200'
        color='green.500'
        size='xl'
      />
    </Center>
  )
}
