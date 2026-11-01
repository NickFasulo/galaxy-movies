import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Head from 'next/head'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { getMonthlyChanges, type MonthlyChanges } from '../../features/catalog/streamingChanges'
import { embeddableProviders, providerLabel } from '../../features/catalog/embed'
import { setSwrCache } from '../../lib/http'
import { withTimeout } from '../../lib/withTimeout'
import { SITE_URL } from '../../lib/site'

interface ChurnRow {
  key: string
  label: string
  arrived: number
  departed: number
  net: number
}

interface Props {
  month: string
  rows: ChurnRow[]
  palette: 'dark' | 'light'
}

const ROW_LIMIT = 6

export async function getServerSideProps({ query, res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const providers = embeddableProviders().map((p) => p.key)
  const monthly = (await withTimeout(getMonthlyChanges(providers), 2000, {} as Record<string, MonthlyChanges>)) || {}

  const rows = providers
    .map((key) => {
      const m = monthly[key]
      const arrived = m?.arrived?.length || 0
      const departed = m?.departed?.length || 0
      return { key, label: providerLabel(key), arrived, departed, net: arrived - departed }
    })
    .filter((r) => r.arrived + r.departed > 0)
    .sort((a, b) => (b.arrived + b.departed) - (a.arrived + a.departed))
    .slice(0, ROW_LIMIT)

  const month = Object.values(monthly).find((m) => m?.month)?.month || new Date().toISOString().slice(0, 7)

  setSwrCache(res, 21600)
  return {
    props: {
      month,
      rows,
      palette: query.theme === 'light' ? 'light' : 'dark'
    }
  }
}

const PALETTES = {
  dark: { bg: '#14181c', text: 'whiteAlpha.900', sub: 'gray.400', divider: 'gray.600', up: 'green.300', down: 'red.300' },
  light: { bg: 'white', text: 'gray.800', sub: 'gray.600', divider: 'gray.300', up: 'green.600', down: 'red.600' }
}

export default function ChurnEmbed({ month, rows, palette }: Props) {
  const c = PALETTES[palette]
  const reportUrl = `${SITE_URL}/reports/streaming-churn`
  const [year, monthNum] = month.split('-')
  const monthLabel = new Date(`${year}-${monthNum}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <Box bg={c.bg} minH='100dvh' p={4}>
      <Head>
        <meta name='robots' content='noindex' />
      </Head>
      <Link
        href={reportUrl}
        target='_blank'
        rel='noopener noreferrer'
        display='block'
        color={c.text}
        fontWeight='bold'
        fontSize='md'
        mb={1}
        _hover={{ textDecoration: 'underline' }}
      >
        Streaming churn: {monthLabel}
      </Link>
      <Text fontSize='xs' color={c.sub} mb={3}>Net catalog change per service, tracked daily</Text>

      {rows.length === 0 ? (
        <Text fontSize='sm' color={c.sub}>No churn data this month yet.</Text>
      ) : (
        rows.map((row) => (
          <Flex key={row.key} align='center' justify='space-between' py={1.5} borderTop='1px solid' borderColor={c.divider}>
            <Text fontSize='sm' color={c.text}>{row.label}</Text>
            <Flex fontSize='xs' gap={3} align='center'>
              <Text color={c.up}>+{row.arrived}</Text>
              <Text color={c.down}>−{row.departed}</Text>
              <Text color={row.net >= 0 ? c.up : c.down} fontWeight='semibold' minW='2.5rem' textAlign='right'>
                {row.net >= 0 ? '+' : ''}{row.net}
              </Text>
            </Flex>
          </Flex>
        ))
      )}

      <Text fontSize='xs' color={c.sub} borderTop='1px solid' borderColor={c.divider} pt={2} mt={3}>
        Data by{' '}
        <Link href={reportUrl} target='_blank' rel='noopener noreferrer' color={c.text} fontWeight='semibold' _hover={{ textDecoration: 'underline' }}>
          Galaxy Movies
        </Link>
        {' '}· updated daily
      </Text>
    </Box>
  )
}
