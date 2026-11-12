import type { MouseEvent } from 'react'
import { Button, IconButton, type ButtonProps } from '@chakra-ui/react';
import { Tooltip } from '@/components/ui/tooltip';
import { BsEye, BsEyeFill } from 'react-icons/bs'
import { useUserData } from '../hooks/useUserData'
import { isWatched, toggleWatched, type WatchlistableTitle } from '../../../lib/userData'
import { trackEvent } from '../../../lib/umami'

export default function WatchedButton({ movie, withLabel = false, ...props }: { movie: WatchlistableTitle; withLabel?: boolean } & Omit<ButtonProps, 'onClick'>) {
  const data = useUserData()
  const watched = isWatched(movie.id, data, movie.mediaType || 'movie')
  const label = watched ? 'Watched: click to undo' : 'Mark as watched'

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    toggleWatched(movie)
    trackEvent(watched ? 'watched-remove' : 'watched-add', { title: movie.title || '' })
  }

  if (withLabel) {
    return (
      <Tooltip content={label} showArrow positioning={{
        placement: 'top'
      }}>
        <Button
          size={{ base: 'md', md: 'sm' }}
          width={{ base: '8rem', md: '7rem' }}
          aria-label={label}
          bg={watched ? 'brand.accent' : 'blackAlpha.600'}
          color='white'
          border='1px solid var(--chakra-colors-border-subtle)'
          _hover={{ bg: watched ? 'brand.accentHover' : 'blackAlpha.800' }}
          onClick={handleClick}
          {...props}>{watched ? <BsEyeFill /> : <BsEye />}{watched ? 'Watched' : 'Watched?'}</Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={label} showArrow positioning={{
      placement: 'top'
    }}>
      <IconButton
        aria-label={label}
        size='sm'
        variant='solid'
        bg={watched ? 'brand.accent' : 'blackAlpha.600'}
        color='white'
        border='1px solid var(--chakra-colors-border-subtle)'
        _hover={{ bg: watched ? 'brand.accentHover' : 'blackAlpha.800' }}
        onClick={handleClick}
        {...props}>{watched ? <BsEyeFill /> : <BsEye />}</IconButton>
    </Tooltip>
  );
}
