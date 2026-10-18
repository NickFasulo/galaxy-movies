import type { ReactNode } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { Box, Flex, Icon, Text } from '@chakra-ui/react'
import VideoModal from './VideoModal'
import WatchlistButton from '../../alerts/components/WatchlistButton'
import BackButton from '../../../components/BackButton'
import type { WatchlistableTitle } from '../../../lib/userData'

export function DetailMetaItem({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Flex align='center'>
      {icon && <Icon color='white' asChild>{icon}</Icon>}
      <Text color='white' textShadow='0 0 4px black' ml={icon ? 1.5 : 0}>{children}</Text>
    </Flex>
  );
}

export function DetailPoster({
  src,
  alt,
  onError
}: {
  src: string
  alt: string
  onError: () => void
}) {
  return (
    <Box position='relative' w='20rem' h='30rem'>
      <Image
        src={src}
        alt={alt}
        fill
        priority
        sizes='(max-width: 768px) 100vw, 320px'
        onError={onError}
        style={{ objectFit: 'cover', borderRadius: '0.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)' }}
        unoptimized={src === '/poster_fallback.webp'}
      />
    </Box>
  );
}

export function DetailActions({ videoKey, item }: { videoKey: string | null; item: WatchlistableTitle }) {
  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'center', md: 'flex-end' }}
      justify={{ base: 'center', md: 'space-evenly' }}
      gap='2rem'
      w='100%'
      py={{ base: '1rem', md: 0 }}
      my='1rem'
    >
      <VideoModal videoKey={videoKey} />
      <WatchlistButton movie={item} withLabel />
      <BackButton />
    </Flex>
  );
}

const linkStyle = { textDecoration: 'underline', textUnderlineOffset: '3px' } as const

export function DetailErrorView({ title, message }: { title: string; message: string }) {
  return (
    <>
      <Head>
        <title>{title} | Galaxy Movies</title>
        <meta name='description' content={message} />
      </Head>
      <Box flex='1' p={8} pt={20} textAlign='center' color='white'>
        <Text mt={20} mb={4} color='gray.300'>{message}</Text>
        <Flex justify='center' gap={5} wrap='wrap' fontSize='sm'>
          <Link href='/' style={linkStyle}>Home</Link>
          <Link href='/browse' style={linkStyle}>Browse movies</Link>
          <Link href='/tv' style={linkStyle}>Browse shows</Link>
          <Link href='/streaming' style={linkStyle}>Streaming services</Link>
        </Flex>
      </Box>
    </>
  );
}
