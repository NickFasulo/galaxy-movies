import type { MouseEvent } from 'react'
import { Button, IconButton, type ButtonProps } from '@chakra-ui/react';
import { Tooltip } from '@/components/ui/tooltip';
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
      <Tooltip content={label} showArrow positioning={{
        placement: 'top'
      }}>
        <Button
          size={{ base: 'md', md: 'sm' }}
          width={{ base: '8rem', md: '7rem' }}
          aria-label={label}
          bg={saved ? 'brand.accent' : 'blackAlpha.600'}
          color='white'
          border='1px solid var(--chakra-colors-border-subtle)'
          _hover={{ bg: saved ? 'brand.accentHover' : 'blackAlpha.800' }}
          onClick={handleClick}
          {...props}>{saved ? <BsBookmarkFill /> : <BsBookmark />}{saved ? 'Saved' : 'Save'}</Button>
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
        bg={saved ? 'brand.accent' : 'blackAlpha.600'}
        color='white'
        border='1px solid var(--chakra-colors-border-subtle)'
        _hover={{ bg: saved ? 'brand.accentHover' : 'blackAlpha.800' }}
        onClick={handleClick}
        {...props}>{saved ? <BsBookmarkFill /> : <BsBookmark />}</IconButton>
    </Tooltip>
  );
}
