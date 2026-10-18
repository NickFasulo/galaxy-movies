import type { ReactNode } from 'react'
import NextLink from 'next/link'
import { Text } from '@chakra-ui/react';

export function DetailCreditLine({
  mt = { base: 4, md: 1 },
  as,
  children
}: {
  mt?: number | string | Record<string, number | string>
  as?: 'p' | 'div'
  children: ReactNode
}) {
  return (
    <Text
      as={as}
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

export function DetailCreditLink({ href, muted = false, children }: { href: string; muted?: boolean; children: ReactNode }) {
  return (
    <NextLink href={href} passHref>
      <Text
        as='span'
        color={muted ? 'gray.300' : 'white'}
        fontWeight={muted ? 'normal' : 'semibold'}
        _hover={{ textDecoration: 'underline' }}
        cursor='pointer'
      >
        {children}
      </Text>
    </NextLink>
  );
}
