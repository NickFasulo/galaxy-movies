import type { MouseEvent } from 'react'
import { Button, IconButton, Tooltip, type ButtonProps } from '@chakra-ui/react'
import { BsBookmark, BsBookmarkFill } from 'react-icons/bs'
import { useUserData } from '../hooks/useUserData'
import { isWatchlisted, toggleWatchlist, type WatchlistableTitle } from '../utils/userData'

export default function WatchlistButton({ movie, withLabel = false, ...props }: { movie: WatchlistableTitle; withLabel?: boolean } & Omit<ButtonProps, 'onClick'>) {
  const data = useUserData()
  const saved = isWatchlisted(movie.id, data, movie.mediaType || 'movie')
  const label = saved ? 'Saved to My List' : 'Save to My List'

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    toggleWatchlist(movie)
  }

  if (withLabel) {
    return (
      <Tooltip label={label} hasArrow placement='top'>
        <Button
          leftIcon={saved ? <BsBookmarkFill /> : <BsBookmark />}
          size={{ base: 'md', md: 'sm' }}
          width={{ base: '8rem', md: '7rem' }}
          aria-label={label}
          bg={saved ? '#2b6cb0' : 'blackAlpha.600'}
          color='white'
          border='1px solid'
          borderColor='whiteAlpha.300'
          _hover={{ bg: saved ? '#2c5282' : 'blackAlpha.800' }}
          onClick={handleClick}
          {...props}
        >
          {saved ? 'Saved' : 'Save'}
        </Button>
      </Tooltip>
    )
  }

  return (
    <Tooltip label={label} hasArrow placement='top'>
      <IconButton
        aria-label={label}
        icon={saved ? <BsBookmarkFill /> : <BsBookmark />}
        size='sm'
        variant='solid'
        bg={saved ? '#2b6cb0' : 'blackAlpha.600'}
        color='white'
        border='1px solid'
        borderColor='whiteAlpha.300'
        _hover={{ bg: saved ? '#2c5282' : 'blackAlpha.800' }}
        onClick={handleClick}
        {...props}
      />
    </Tooltip>
  )
}
