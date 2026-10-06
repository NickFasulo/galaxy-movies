import { Flex, Text, Link } from '@chakra-ui/react'
import { SURFSHARK_AFFILIATE_LINK } from '../utils/surfsharkAffiliate'

export default function SurfsharkBanner({ message }: { message: string }) {
  return (
    <Flex
      mt={6}
      p={4}
      bg='#1f252b'
      border='1px solid var(--chakra-colors-white-alpha-300)'
      borderRadius='0.5rem'
      align={{ base: 'flex-start', md: 'center' }}
      justify='space-between'
      direction={{ base: 'column', md: 'row' }}
      gap={3}
    >
      <Text color='gray.300' fontSize='sm'>{message}</Text>
      <Link
        href={SURFSHARK_AFFILIATE_LINK}
        rel='sponsored nofollow noopener'
        color='white'
        fontWeight='semibold'
        fontSize='sm'
        whiteSpace='nowrap'
        px={4}
        py={2}
        border='1px solid var(--chakra-colors-white-alpha-300)'
        borderRadius='0.5rem'
        _hover={{ bg: 'whiteAlpha.100' }}
        target='_blank'
      >
        Try Surfshark VPN ↗
      </Link>
    </Flex>
  );
}
