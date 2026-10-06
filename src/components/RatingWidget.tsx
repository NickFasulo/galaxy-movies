import { Box, Flex, Popover, Portal, useDisclosure, Icon } from '@chakra-ui/react';
import { Tooltip } from '@/components/ui/tooltip';
import { useState } from 'react'
import { useUserData } from '../hooks/useUserData'
import { getRating, setRating } from '../utils/userData'
import type { TitleSummary } from '../types/tmdb'
import { LuStar } from 'react-icons/lu';

export default function RatingWidget({ movie }: { movie: TitleSummary }) {
  const data = useUserData()
  const mediaType = movie.mediaType || 'movie'
  const rating = getRating(movie.id, data, mediaType)
  const [hovered, setHovered] = useState<number | null>(null)
  const { open, onToggle, onClose } = useDisclosure()
  const shown = hovered ?? rating ?? 0

  const pick = (n: number) => {
    setRating(movie.id, n === rating ? null : n, movie.title || movie.name || '', mediaType)
    onClose()
  }

  return (
    <Popover.Root open={open} lazyMount onOpenChange={(e) => { if (!e.open) onClose() }} positioning={{
      placement: 'bottom-end'
    }}>
      <Popover.Trigger asChild>
        <Flex
          align='center'
          gap={1}
          aria-label={rating ? `Your rating: ${rating}/10` : `Rate this ${mediaType === 'tv' ? 'show' : 'movie'}`}
          color={rating ? 'white' : 'gray.400'}
          fontSize='xs'
          _hover={{ color: 'white' }}
          asChild><button type='button' onClick={onToggle}>
            <Icon boxSize={3} color={rating ? 'gold' : 'inherit'} asChild><LuStar /></Icon>
            {rating ? `${rating}/10` : 'Rate'}
          </button></Flex>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
        <Popover.Content w='auto' bg='gray.800' borderColor='gray.700'>
          <Popover.Body p={2}>
            <Flex gap={0.5} role='radiogroup' aria-label='Your rating'>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Tooltip key={n} content={n === rating ? 'Clear' : `${n}/10`} showArrow positioning={{
                  placement: 'top'
                }}>
                  <Box aria-label={`Rate ${n} out of 10`} asChild><button
                      type='button'
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => pick(n)}>
                      <Icon
                        boxSize={4}
                        color={n <= shown ? 'gold' : 'whiteAlpha.300'}
                        transition='color 0.1s'
                        asChild><LuStar /></Icon>
                    </button></Box>
                </Tooltip>
              ))}
            </Flex>
          </Popover.Body>
        </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
