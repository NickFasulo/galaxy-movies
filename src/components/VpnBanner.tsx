import { Flex, Text, Link, Image } from '@chakra-ui/react'
import { VPN_DEAL_LINK, VPN_DEAL_PIXEL, VPN_CTA_TEXT } from '../utils/vpnAffiliate'

export default function VpnBanner({ message }: { message: string }) {
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
      position='relative'
    >
      <Text color='gray.300' fontSize='sm'>{message}</Text>
      <Link
        href={VPN_DEAL_LINK}
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
        {VPN_CTA_TEXT} ↗
      </Link>
      <Image src={VPN_DEAL_PIXEL} alt='' aria-hidden w='1px' h='1px' position='absolute' />
    </Flex>
  );
}
