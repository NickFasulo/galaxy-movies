import { Box, Link, Image as ChakraImage } from '@chakra-ui/react'
import { LuArrowUpRight } from 'react-icons/lu'

export default function AffiliateTextLink({ href, pixel, text, event }: { href: string; pixel: string; text: string; event: string }) {
  return (
    <Box position='relative'>
      <Link
        href={href}
        rel='sponsored nofollow noopener'
        data-umami-event={event}
        fontSize='2xs'
        color='gray.300'
        display='inline-flex'
        alignItems='center'
        gap={0.5}
        transition='color 0.15s'
        _hover={{ color: 'white' }}
        target='_blank'
      >
        {text} <LuArrowUpRight />
      </Link>
      <ChakraImage src={pixel} alt='' aria-hidden w='1px' h='1px' position='absolute' />
    </Box>
  );
}
