import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'
import { ArrowBackIcon } from '@chakra-ui/icons'

export default function BackButton() {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/')
    }
  }

  return (
    <Button
      size={{ base: 'md', md: 'sm' }}
      width={{ base: '8rem', md: '7rem' }}
      leftIcon={<ArrowBackIcon />}
      onClick={handleBack}
    >
      Back
    </Button>
  )
}