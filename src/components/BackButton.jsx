import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'

export default function BackButton() {
  const router = useRouter()

  return (
    <Button
      size='sm'
      width='7rem'
      onClick={() => router.back()}
    >
      Go Back
    </Button>
  )
}
