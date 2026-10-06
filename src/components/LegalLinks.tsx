import NextLink from 'next/link'
import { Link } from '@chakra-ui/react'

export default function LegalLinks() {
  return (
    <>
      <Link asChild><NextLink href='/privacy'>Privacy</NextLink></Link>·{' '}
      <Link asChild><NextLink href='/terms'>Terms</NextLink></Link>·{' '}
      <Link asChild><NextLink href='/contact'>Contact</NextLink></Link>·{' '}
      <Link asChild><NextLink href='/disclosure'>Disclosure</NextLink></Link>
    </>
  );
}
