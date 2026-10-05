import NextLink from 'next/link'
import { Link } from '@chakra-ui/react'

export default function LegalLinks() {
  return (
    <>
      <Link as={NextLink} href='/privacy'>Privacy</Link> ·{' '}
      <Link as={NextLink} href='/terms'>Terms</Link> ·{' '}
      <Link as={NextLink} href='/contact'>Contact</Link> ·{' '}
      <Link as={NextLink} href='/disclosure'>Disclosure</Link>
    </>
  )
}
