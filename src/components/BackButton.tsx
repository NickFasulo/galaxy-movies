import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'
import { LuArrowLeft } from 'react-icons/lu';

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
      onClick={handleBack}
      bg='#1f252b'
      color='white'
      border='1px solid var(--chakra-colors-white-alpha-300)'
      _hover={{ bg: '#2a3138' }}><LuArrowLeft />Back
                </Button>
  );
}