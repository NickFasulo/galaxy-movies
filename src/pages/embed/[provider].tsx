import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import { Box, Link, Text } from '@chakra-ui/react'
import { getProviderChanges, type ProviderChanges } from '../../features/catalog/streamingChanges'
import { isEmbeddableProvider, providerLabel } from '../../features/catalog/embed'
import { setSwrCache } from '../../lib/http'
import { shortDate } from '../../lib/format/formatters'
import { withTimeout } from '../../lib/withTimeout'
import { SITE_URL } from '../../lib/site'
import type { MediaType } from '../../types/tmdb'

interface WidgetItem {
  tmdbId: number | null
  tmdbType: MediaType
  title: string
  year?: number | null
  date?: string
  season?: number | null
}

interface Props {
  provider: string
  label: string
  palette: 'dark' | 'light'
  coming: WidgetItem[]
  added: WidgetItem[]
  left: WidgetItem[]
}

const ITEM_LIMIT = 8

export async function getServerSideProps({ params, query, res }: GetServerSidePropsContext<{ provider: string }>): Promise<GetServerSidePropsResult<Props>> {
  const provider = params?.provider ?? ''
  if (!isEmbeddableProvider(provider)) return { notFound: true }

  const changes: Record<string, ProviderChanges> = (await withTimeout(getProviderChanges([provider]), 2000, {})) || {}
  const change = changes[provider]
  const limit = (items?: WidgetItem[]) => (items || []).slice(0, ITEM_LIMIT)

  setSwrCache(res, 21600)
  return {
    props: {
      provider,
      label: providerLabel(provider),
      palette: query.theme === 'light' ? 'light' : 'dark',
      coming: limit(change?.coming),
      added: limit(change?.added),
      left: limit(change?.left)
    }
  }
}

const dayLabel = shortDate

const PALETTES = {
  dark: { bg: '#14181c', text: 'whiteAlpha.900', sub: 'gray.400', divider: 'gray.600' },
  light: { bg: 'white', text: 'gray.800', sub: 'gray.600', divider: 'gray.300' }
}
type Palette = (typeof PALETTES)[keyof typeof PALETTES]

const LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' } as const

function Item({ item, c, fallbackUrl }: { item: WidgetItem; c: Palette; fallbackUrl: string }) {
  return (
    <Link
      href={item.tmdbId ? `${SITE_URL}/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}` : fallbackUrl}
      {...LINK_PROPS}
      display='block'
      py={1}
      color={c.text}
      fontSize='sm'
      lineHeight='short'
      _hover={{ textDecoration: 'underline' }}
    >
      {item.title}{item.year ? ` (${item.year})` : ''}{item.date ? ` - ${dayLabel(item.date)}` : ''}{item.season ? ` (season ${item.season})` : ''}
    </Link>
  )
}

function Section({ heading, items, c, fallbackUrl }: { heading: string; items: WidgetItem[]; c: Palette; fallbackUrl: string }) {
  if (!items.length) return null
  return (
    <Box mb={3}>
      <Text fontSize='xs' fontWeight='semibold' letterSpacing='wide' textTransform='uppercase' color={c.sub} mb={1}>{heading}</Text>
      {items.map((item) => <Item key={`${item.tmdbType}-${item.tmdbId}-${item.date || item.title}`} item={item} c={c} fallbackUrl={fallbackUrl} />)}
    </Box>
  )
}

export default function EmbedWidget({ provider, label, palette, coming, added, left }: Props) {
  const c = PALETTES[palette]
  const fullListUrl = `${SITE_URL}/leaving/${provider}`
  const empty = !coming.length && !added.length && !left.length

  return (
    <Box bg={c.bg} minH='100dvh' p={4}>
      <Head>
        <meta name='robots' content='noindex' />
      </Head>
      <Link
        href={fullListUrl}
        {...LINK_PROPS}
        display='block'
        color={c.text}
        fontWeight='bold'
        fontSize='md'
        mb={3}
        _hover={{ textDecoration: 'underline' }}
      >
        What&apos;s new and leaving {label}
      </Link>

      {empty ? (
        <Text fontSize='sm' color={c.sub}>
          No catalog changes tracked this week.{' '}
          <Link href={`${SITE_URL}/streaming/${provider}`} {...LINK_PROPS} color={c.text} textDecoration='underline'>
            Browse everything on {label}
          </Link>
        </Text>
      ) : (
        <>
          <Section heading='Coming soon' items={coming} c={c} fallbackUrl={fullListUrl} />
          <Section heading='Just added' items={added} c={c} fallbackUrl={fullListUrl} />
          <Section heading='Left recently' items={left} c={c} fallbackUrl={fullListUrl} />
          <Link href={fullListUrl} {...LINK_PROPS} display='block' fontSize='sm' color={c.sub} textDecoration='underline' mb={2}>
            See the full list
          </Link>
        </>
      )}

      <Text fontSize='xs' color={c.sub} borderTop='1px solid' borderColor={c.divider} pt={2} mt={3}>
        Data by{' '}
        <Link href={SITE_URL} {...LINK_PROPS} color={c.text} fontWeight='semibold' _hover={{ textDecoration: 'underline' }}>
          Galaxy Movies
        </Link>
        {' '}· updated daily
      </Text>
    </Box>
  )
}
