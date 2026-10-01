import { useRouter } from 'next/router'
import { Button } from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'

export default function HomeButton() {
  const router = useRouter()

  const handleHome = () => {
    router.push('/')
  }

  return (
    <Button
      size={{ base: 'md', md: 'sm' }}
      width={{ base: '8rem', md: '7rem' }}
      leftIcon={<SearchIcon />}
      onClick={handleHome}
      bg='#1f252b' color='white' border='1px solid' borderColor='whiteAlpha.300' _hover={{ bg: '#2a3138' }}
    >
      Home
    </Button>
  )
}