import Head from 'next/head'
import Link from 'next/link'
import { Box, Flex, Text } from '@chakra-ui/react';

const linkStyle = { textDecoration: 'underline', textUnderlineOffset: '3px' } as const

export default function DetailErrorView({ title, message }: { title: string; message: string }) {
  return (
    <>
      <Head>
        <title>{title} | Galaxy Movies</title>
        <meta name='description' content={message} />
      </Head>
      <Box minH='100vh' p={8} pt={20} textAlign='center' bg='surface.canvas' color='white'>
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
