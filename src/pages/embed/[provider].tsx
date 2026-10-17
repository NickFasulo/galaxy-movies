import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import { Box, Link, Text } from '@chakra-ui/react'
import { getProviderChanges, type ProviderChanges } from '../../utils/streamingChanges'
import { isEmbeddableProvider, providerLabel } from '../../utils/embed'
import { setSwrCache } from '../../utils/ssr'
import { withTimeout } from '../../utils/withTimeout'
import { SITE_URL } from '../../utils/site'
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(date: string) {
  const m = date.match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ''
}

const PALETTES = {
  dark: { bg: '#14181c', text: 'whiteAlpha.900', sub: 'gray.400', divider: 'gray.600' },
  light: { bg: 'white', text: 'gray.800', sub: 'gray.600', divider: 'gray.300' }
}

export default function EmbedWidget({ provider, label, palette, coming, added, left }: Props) {
  const c = PALETTES[palette]
  const fullListUrl = `${SITE_URL}/leaving/${provider}`
  const linkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

  const Item = ({ item }: { item: WidgetItem }) => (
    <Link
      href={item.tmdbId ? `${SITE_URL}/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}` : fullListUrl}
      {...linkProps}
      display='block'
      py={1}
      color={c.text}
      fontSize='sm'
      lineHeight='short'
      _hover={{ textDecoration: 'underline' }}
    >
      {item.title}{item.year ? ` (${item.year})` : ''}{item.date ? ` — ${dayLabel(item.date)}` : ''}{item.season ? ` (season ${item.season})` : ''}
    </Link>
  )

  const Section = ({ heading, items }: { heading: string; items: WidgetItem[] }) =>
    items.length ? (
      <Box mb={3}>
        <Text fontSize='xs' fontWeight='semibold' letterSpacing='wide' textTransform='uppercase' color={c.sub} mb={1}>{heading}</Text>
        {items.map((item) => <Item key={`${item.tmdbType}-${item.tmdbId}-${item.date || item.title}`} item={item} />)}
      </Box>
    ) : null

  const empty = !coming.length && !added.length && !left.length

  return (
    <Box bg={c.bg} minH='100dvh' p={4}>
      <Head>
        <meta name='robots' content='noindex' />
      </Head>
      <Link
        href={fullListUrl}
        {...linkProps}
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
          <Link href={`${SITE_URL}/streaming/${provider}`} {...linkProps} color={c.text} textDecoration='underline'>
            Browse everything on {label}
          </Link>
        </Text>
      ) : (
        <>
          <Section heading='Coming soon' items={coming} />
          <Section heading='Just added' items={added} />
          <Section heading='Left recently' items={left} />
          <Link href={fullListUrl} {...linkProps} display='block' fontSize='sm' color={c.sub} textDecoration='underline' mb={2}>
            See the full list
          </Link>
        </>
      )}

      <Text fontSize='xs' color={c.sub} borderTop='1px solid' borderColor={c.divider} pt={2} mt={3}>
        Data by{' '}
        <Link href={SITE_URL} {...linkProps} color={c.text} fontWeight='semibold' _hover={{ textDecoration: 'underline' }}>
          Galaxy Movies
        </Link>
        {' '}· updated daily
      </Text>
    </Box>
  )
}
