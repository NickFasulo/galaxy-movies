import NextLink from 'next/link'
import { Box, Link } from '@chakra-ui/react'
import WatchlistButton from '../alerts/components/WatchlistButton'
import type { ResolvedMention } from './movieSearch'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderMessageContent(content: string, links: ResolvedMention[] | undefined) {
  if (!links || links.length === 0) {
    return content
  }

  const escaped = links.map((link) => escapeRegExp(link.match)).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = content.split(pattern)

  return parts.map((part, index) => {
    const link = links.find((l) => l.match === part)
    if (!link) return part

    return (
      <Box as='span' key={index}>
        <Link
          color="blue.300"
          fontWeight="semibold"
          _hover={{ textDecoration: 'underline' }}
          asChild><NextLink
            href={link.mediaType === 'tv' ? `/tv/${link.movieId}` : `/movies/${link.movieId}`}>
            {part}
          </NextLink></Link>
        <WatchlistButton
          movie={{ id: link.movieId, mediaType: link.mediaType === 'tv' ? 'tv' : 'movie', title: link.title, release_date: link.releaseDate || link.year, poster_path: link.poster_path }}
          size='2xs'
          ml={1}
          variant='ghost'
        />
      </Box>
    );
  });
}
