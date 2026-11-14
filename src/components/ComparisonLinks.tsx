import Link from 'next/link'
import { Button, Flex, Heading } from '@chakra-ui/react'
import { secondaryButton } from '../theme'

export const COMPARISON_PAGES = [
  { href: '/justwatch-alternative', label: 'JustWatch' },
  { href: '/reelgood-alternative', label: 'Reelgood' },
  { href: '/letterboxd-alternative', label: 'Letterboxd' },
  { href: '/trakt-alternative', label: 'Trakt' },
  { href: '/tv-time-alternative', label: 'TV Time' },
  { href: '/imdb-alternative', label: 'IMDb' },
  { href: '/whats-on-netflix-alternative', label: "What's on Netflix" },
  { href: '/flixable-alternative', label: 'Flixable' },
  { href: '/instantwatcher-alternative', label: 'InstantWatcher' },
  { href: '/can-i-stream-it-alternative', label: 'Can I Stream It' },
  { href: '/compare/filmatic', label: 'Filmatic' }
]

export default function ComparisonLinks({ exclude }: { exclude: string }) {
  const others = COMPARISON_PAGES.filter((p) => p.href !== exclude)
  return (
    <>
      <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>More comparisons</Heading>
      <Flex wrap='wrap' gap={2}>
        {others.map((p) => (
          <Button key={p.href} asChild size='xs' {...secondaryButton}>
            <Link href={p.href}>vs {p.label}</Link>
          </Button>
        ))}
      </Flex>
    </>
  )
}
