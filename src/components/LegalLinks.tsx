import NextLink from 'next/link'
import { Fragment } from 'react'
import { Link, Text } from '@chakra-ui/react'

const ITEMS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
  { href: '/disclosure', label: 'Disclosure' }
]

export default function LegalLinks() {
  return (
    <>
      {ITEMS.map((item, i) => (
        <Fragment key={item.href}>
          {i > 0 && <Text as='span' color='gray.600' mx={2}>·</Text>}
          <Link color='gray.400' fontSize='xs' transition='color 0.15s' _hover={{ color: 'white' }} asChild>
            <NextLink href={item.href}>{item.label}</NextLink>
          </Link>
        </Fragment>
      ))}
    </>
  );
}
