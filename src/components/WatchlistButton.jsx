import { Button, IconButton, Tooltip } from '@chakra-ui/react'
import { BsBookmark, BsBookmarkFill } from 'react-icons/bs'
import { useUserData } from '../hooks/useUserData'
import { isWatchlisted, toggleWatchlist } from '../utils/userData'

export default function WatchlistButton({ movie, withLabel = false, ...props }) {
  const data = useUserData()
  const saved = isWatchlisted(movie.id, data)
  const label = saved ? 'Saved to My List' : 'Save to My List'

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleWatchlist(movie)
  }

  if (withLabel) {
    return (
      <Button
        leftIcon={saved ? <BsBookmarkFill /> : <BsBookmark />}
        size='md'
        bg={saved ? '#2b6cb0' : 'blackAlpha.600'}
        color='white'
        border='1px solid'
        borderColor='whiteAlpha.300'
        _hover={{ bg: saved ? '#2c5282' : 'blackAlpha.800' }}
        onClick={handleClick}
        {...props}
      >
        {label}
      </Button>
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
