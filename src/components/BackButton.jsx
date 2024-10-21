import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'

export default function BackButton() {
  const router = useRouter()

  return (
    <Button
      size='sm'
      width='8rem'
      margin={{ base: '1.5rem', md: '1.5rem 0 2rem' }}
      onClick={() => router.back()}
    >
      Go Back
    </Button>
  )
}
