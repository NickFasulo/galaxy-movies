import { Spinner } from '@chakra-ui/react'

export default function CustomSpinner() {
  return (
    <Spinner
      thickness='4px'
      emptyColor='gray.200'
      color='green.500'
      size='xl'
      sx={{
        position: 'absolute',
        top: '50vh',
        left: '49vw',
        transform: 'translate(-50vh, -49vw)'
      }}
    />
  )
}
