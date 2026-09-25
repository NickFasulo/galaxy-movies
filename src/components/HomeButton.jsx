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
    >
      Home
    </Button>
  )
}