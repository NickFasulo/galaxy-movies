import { Box, Flex, Tooltip, Popover, PopoverTrigger, PopoverContent, PopoverBody, useDisclosure } from '@chakra-ui/react'
import { StarIcon } from '@chakra-ui/icons'
import { useState } from 'react'
import { useUserData } from '../hooks/useUserData'
import { getRating, setRating } from '../utils/userData'

export default function RatingWidget({ movie }) {
  const data = useUserData()
  const mediaType = movie.mediaType || 'movie'
  const rating = getRating(movie.id, data, mediaType)
  const [hovered, setHovered] = useState(null)
  const { isOpen, onToggle, onClose } = useDisclosure()
  const shown = hovered ?? rating ?? 0

  const pick = (n) => {
    setRating(movie.id, n === rating ? null : n, movie.title || movie.name, mediaType)
    onClose()
  }

  return (
    <Popover isOpen={isOpen} onClose={onClose} placement='bottom-end' isLazy>
      <PopoverTrigger>
        <Flex
          as='button'
          type='button'
          align='center'
          gap={1}
          onClick={onToggle}
          aria-label={rating ? `Your rating: ${rating}/10` : `Rate this ${mediaType === 'tv' ? 'show' : 'movie'}`}
          color={rating ? 'white' : 'gray.400'}
          fontSize='xs'
          _hover={{ color: 'white' }}
        >
          <StarIcon boxSize={3} color={rating ? 'gold' : 'inherit'} />
          {rating ? `${rating}/10` : 'Rate'}
        </Flex>
      </PopoverTrigger>
      <PopoverContent w='auto' bg='gray.800' borderColor='gray.700'>
        <PopoverBody p={2}>
          <Flex gap={0.5} role='radiogroup' aria-label='Your rating'>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Tooltip key={n} label={n === rating ? 'Clear' : `${n}/10`} hasArrow placement='top'>
                <Box
                  as='button'
                  type='button'
                  aria-label={`Rate ${n} out of 10`}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => pick(n)}
                >
                  <StarIcon
                    boxSize={4}
                    color={n <= shown ? 'gold' : 'whiteAlpha.300'}
                    transition='color 0.1s'
                  />
                </Box>
              </Tooltip>
            ))}
          </Flex>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  )
}
