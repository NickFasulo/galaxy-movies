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
      bg='surface.raised'
      color='white'
      border='1px solid var(--chakra-colors-border-subtle)'
      _hover={{ bg: 'surface.overlay' }}><LuArrowLeft />Back
                </Button>
  );
}