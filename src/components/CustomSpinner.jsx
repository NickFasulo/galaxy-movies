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
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    />
  )
}
