import { Spinner, Center } from '@chakra-ui/react'

export default function CustomSpinner({ height = '100dvh' }) {
  return (
    <Center h={height}>
      <Spinner
        borderWidth='4px'
        color='green.500'
        size='xl'
      />
    </Center>
  );
}
