import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'

export default function BackButton(): JSX.Element {
  const router = useRouter()

  return (
    <Button size='sm' width='7rem' onClick={() => void router.back()}>
      Go Back
    </Button>
  )
}
