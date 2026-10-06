import type { ReactNode } from 'react'
import NextLink from 'next/link'
import { Text } from '@chakra-ui/react';

export function DetailCreditLine({
  mt = { base: 4, md: 1 },
  children
}: {
  mt?: number | string | Record<string, number | string>
  children: ReactNode
}) {
  return (
    <Text
      fontSize='sm'
      color='gray.400'
      textShadow='0 0 4px black'
      mt={mt}
      textAlign={{ base: 'center', md: 'left' }}
    >
      {children}
    </Text>
  );
}

export function DetailCreditLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <NextLink href={href} passHref>
      <Text
        as='span'
        color='white'
        fontWeight='semibold'
        _hover={{ textDecoration: 'underline' }}
        cursor='pointer'
      >
        {children}
      </Text>
    </NextLink>
  );
}
