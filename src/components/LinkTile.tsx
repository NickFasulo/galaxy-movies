import type { ReactNode } from 'react'
import Link from 'next/link'
import { Flex } from '@chakra-ui/react'

export default function LinkTile({ href, column = false, children }: {
  href: string
  column?: boolean
  children?: ReactNode
}) {
  return (
    <Link href={href}>
      <Flex
        direction={column ? 'column' : 'row'}
        align={column ? 'stretch' : 'center'}
        justify={column ? 'flex-start' : 'center'}
        minH={column ? undefined : '4rem'}
        p={4}
        borderRadius='0.5rem'
        border='1px solid var(--chakra-colors-border-subtle)'
        _hover={{ borderColor: 'whiteAlpha.600' }}
        h='100%'
      >
        {children}
      </Flex>
    </Link>
  );
}
