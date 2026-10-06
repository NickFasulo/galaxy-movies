import Image from 'next/image'
import { Box } from '@chakra-ui/react';

export default function DetailPoster({
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
