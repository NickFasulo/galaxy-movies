import { Flex } from '@chakra-ui/react';
import VideoModal from './VideoModal'
import WatchlistButton from '../../alerts/components/WatchlistButton'
import BackButton from '../../../components/BackButton'
import type { WatchlistableTitle } from '../../../lib/userData'

export default function DetailActions({ videoKey, item }: { videoKey: string | null; item: WatchlistableTitle }) {
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
