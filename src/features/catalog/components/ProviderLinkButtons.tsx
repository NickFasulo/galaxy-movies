import Image from 'next/image'
import NextLink from 'next/link'
import { Box, Button, Flex } from '@chakra-ui/react'
import { secondaryButton } from '../../../theme'

export interface ProviderLinkItem {
  key: string
  label: string
  href: string
  logo?: string | null
}

export default function ProviderLinkButtons({ providers }: { providers: ProviderLinkItem[] }) {
  return (
    <Flex wrap='wrap' gap={2}>
      {providers.map((p) => (
        <Button asChild key={p.key} size='xs' gap={1.5} {...secondaryButton}>
          <NextLink href={p.href}>
            {p.logo && (
              <Box as='span' position='relative' display='inline-block' w='1rem' h='1rem' borderRadius='0.2rem' overflow='hidden' flexShrink={0}>
                <Image src={p.logo} alt='' fill sizes='16px' style={{ objectFit: 'cover' }} />
              </Box>
            )}
            {p.label}
          </NextLink>
        </Button>
      ))}
    </Flex>
  )
}
