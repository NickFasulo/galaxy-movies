import { Box, Flex, Text, Tooltip } from '@chakra-ui/react'
import { StarIcon } from '@chakra-ui/icons'
import { useState } from 'react'
import { useUserData } from '../hooks/useUserData'
import { getRating, setRating } from '../utils/userData'

export default function RatingWidget({ movie }) {
  const data = useUserData()
  const rating = getRating(movie.id, data)
  const [hovered, setHovered] = useState(null)
  const shown = hovered ?? rating ?? 0

  return (
    <Flex align='center' gap={0.5} role='radiogroup' aria-label='Your rating'>
      <Text fontSize='xs' color='gray.400' textTransform='uppercase' fontWeight='bold' mr={2}>
        Your rating
      </Text>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <Tooltip key={n} label={n === rating ? 'Clear rating' : `${n}/10`} hasArrow placement='top'>
          <Box
            as='button'
            type='button'
            aria-label={`Rate ${n} out of 10`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setRating(movie.id, n === rating ? null : n, movie.title)}
          >
            <StarIcon
              boxSize={3.5}
              color={n <= shown ? 'gold' : 'whiteAlpha.300'}
              transition='color 0.1s'
            />
          </Box>
        </Tooltip>
      ))}
      {rating && (
        <Text fontSize='sm' color='white' ml={2}>{rating}/10</Text>
      )}
    </Flex>
  )
}
