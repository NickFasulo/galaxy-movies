import Head from 'next/head'
import Link from 'next/link'
import { Box, Text } from '@chakra-ui/react';

export default function DetailErrorView({ title, message }: { title: string; message: string }) {
  return (
    <>
      <Head>
        <title>{title} | Galaxy Movies</title>
        <meta name='description' content={message} />
      </Head>
      <Box minH='100vh' p={8} pt={20} textAlign='center' bg='#14181c' color='white'>
        <Text mt={20}>{message}</Text>
        <Link href='/'>Return to Galaxy Movies</Link>
      </Box>
    </>
  );
}
