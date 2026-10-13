import { useEffect, useState } from 'react'
import { Icon, IconButton } from '@chakra-ui/react'
import { LuArrowUp } from 'react-icons/lu'

// Fixed bottom-right scroll-to-top affordance for long scroll pages.
// `bottom` clears page-level fixed UI (the homepage's floating footer pill
// needs 9rem; other pages use the default).
export default function ScrollTopButton({ bottom = '4rem' }: { bottom?: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handleScroll = () => setShow(window.scrollY > 160)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!show) return null

  return (
    <IconButton
      aria-label='Scroll to top'
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      position='fixed'
      size='lg'
      right='1.5rem'
      bottom={bottom}
      zIndex={10}
      borderRadius='full'
      boxShadow='lg'
      bg='surface.raised'
      color='white'
      border='1px solid var(--chakra-colors-border-subtle)'
      _hover={{ bg: 'surface.overlay' }}><Icon boxSize={6} asChild><LuArrowUp /></Icon></IconButton>
  )
}
