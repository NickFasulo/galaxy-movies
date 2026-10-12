import NextLink from 'next/link'
import { Wrap, WrapItem, Badge, Link } from '@chakra-ui/react';
import { movieGenres, tvGenres } from '../utils/tmdb'
import type { MediaType } from '../types/tmdb'

// TMDB genre id → site slug, built once from the registries. Ids with no
// registry entry (TV-only News/Talk/Soap) fall back to a plain badge.
const SLUGS: Record<MediaType, Map<number, string>> = {
  movie: new Map(Object.entries(movieGenres).map(([slug, genre]) => [genre.id, slug])),
  tv: new Map(Object.entries(tvGenres).map(([slug, genre]) => [genre.id, slug]))
}

export default function GenreBadges({ genres, mediaType = 'movie' }: { genres?: { id: number; name: string }[]; mediaType?: MediaType }) {
  const basePath = mediaType === 'tv' ? '/tv/genre' : '/genre'
  return (
    <Wrap justify='center' gap={{ base: 4, md: 2 }}>
      {genres?.map((genre) => {
        const slug = SLUGS[mediaType].get(genre.id)
        return (
          <WrapItem key={genre.id}>
            {slug ? (
              <Link asChild data-umami-event='genre-click' data-umami-event-genre={slug} _hover={{ textDecoration: 'none' }}>
                <NextLink href={`${basePath}/${slug}`}>
                  <Badge as='span' cursor='pointer' _hover={{ bg: 'whiteAlpha.300' }}>{genre.name}</Badge>
                </NextLink>
              </Link>
            ) : (
              <Badge>{genre.name}</Badge>
            )}
          </WrapItem>
        )
      })}
    </Wrap>
  );
}
