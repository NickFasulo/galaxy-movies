import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'

export default function BackButton() {
  const router = useRouter()

  const handleBack = () => {
    const hasSameOriginHistory =
      window.history.length > 1 &&
      document.referrer.startsWith(window.location.origin)

    if (hasSameOriginHistory) {
      router.back()
      return
    }

    router.push('/')
  }

  return (
    <Button
      size='sm'
      width={{ base: '5.5rem', md: '7rem' }}
      onClick={handleBack}
    >
      Go Back
    </Button>
  )
}
