import { Spinner, Center } from '@chakra-ui/react'

export default function CustomSpinner({ height = '100dvh' }) {
  return (
    <Center h={height}>
      <Spinner
        borderWidth='4px'
        color='brand.accent'
        size='xl'
      />
    </Center>
  );
}
