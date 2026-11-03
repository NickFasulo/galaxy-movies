import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Button, Flex, Table, Text } from '@chakra-ui/react'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { secondaryButton } from '../../theme'
import {
  buildChurnRows,
  getCatalogSizes,
  getYearlyChanges,
  type CatalogSizePoint,
  type ChurnProviderRow
} from '../../features/catalog/streamingChanges'
import { setSwrCache } from '../../lib/http'
import { SITE_URL } from '../../lib/site'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthShort = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const monthLong = (m: string) => {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
}

const MAX_COLS = 6

interface Props {
  rows: ChurnProviderRow[]
  months: string[]
  latestMonth: string | null
  year: string
  sizes: Record<string, CatalogSizePoint>
  dataError?: boolean
}

export async function getServerSideProps({ res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const year = new Date().toISOString().slice(0, 4)
  try {
    const [yearly, sizes] = await Promise.all([getYearlyChanges('US', year), getCatalogSizes('US', year)])
    const rows = buildChurnRows(yearly)
    const months = [...new Set(rows.flatMap((r) => Object.keys(r.months)))].sort().slice(-MAX_COLS)
    setSwrCache(res, 21600)
    return { props: { rows, months, latestMonth: months[months.length - 1] || null, year, sizes } }
  } catch (error) {
    console.error(error)
    res.statusCode = 502
    return { props: { rows: [], months: [], latestMonth: null, year, sizes: {}, dataError: true } }
  }
}

const netColor = (net: number) => (net > 0 ? 'green.300' : net < 0 ? 'red.300' : 'gray.400')

export default function StreamingChurn({ rows, months, latestMonth, year, sizes, dataError }: Props) {
  const canonicalUrl = `${SITE_URL}/reports/streaming-churn`
  const latest = latestMonth ? monthLong(latestMonth) : year
  const title = `Streaming churn report: who gained and lost the most titles`
  const description = `Monthly net adds and losses across major US streaming services, tracked daily by Galaxy Movies. See which services' catalogs are growing and which are shrinking.`

  const latestRows = latestMonth
    ? rows
        .map((r) => ({ key: r.key, label: r.label, cell: r.months[latestMonth] }))
        .filter((r) => r.cell)
        .sort((a, b) => b.cell.net - a.cell.net)
    : []
  const gainer = latestRows.find((r) => r.cell.net > 0)
  const loser = [...latestRows].reverse().find((r) => r.cell.net < 0)

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        ogImage={`${SITE_URL}/api/og-churn`}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Reports', url: `${SITE_URL}/reports` },
          { name: 'Streaming churn', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        {dataError ? (
          <Text mt={10}>Streaming data is temporarily unavailable. Please try again later.</Text>
        ) : rows.length === 0 ? (
          <Text mt={10} color='gray.300' maxW='42rem'>
            Churn data accumulates as we track provider catalogs day over day. Check back soon, or see{' '}
            <Link href='/this-month' style={{ textDecoration: 'underline' }}>this month&apos;s arrivals and departures</Link>.
          </Text>
        ) : (
          <>
            {(gainer || loser) && (
              <Text mt={4} color='gray.300' fontSize='md' maxW='42rem'>
                In {latest}
                {gainer ? `, ${gainer.label} posted the biggest gain (+${gainer.cell.arrived} / −${gainer.cell.departed})` : ''}
                {loser ? ` while ${loser.label} shrank the most (+${loser.cell.arrived} / −${loser.cell.departed})` : ''}.
              </Text>
            )}

            <Table.ScrollArea mt={8} border='1px solid var(--chakra-colors-border-subtle)' borderRadius='0.5rem'>
              <Table.Root variant='line' size='sm'>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader color='gray.400' borderColor='border.subtle'>Service</Table.ColumnHeader>
                    {months.map((m) => (
                      <Table.ColumnHeader key={m} color='gray.400' borderColor='border.subtle' textAlign='right'>
                        {monthShort(m)}
                      </Table.ColumnHeader>
                    ))}
                    <Table.ColumnHeader color='gray.400' borderColor='border.subtle' textAlign='right'>
                      {year} net
                    </Table.ColumnHeader>
                    <Table.ColumnHeader color='gray.400' borderColor='border.subtle' textAlign='right'>
                      Catalog
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((row) => (
                    <Table.Row key={row.key}>
                      <Table.Cell borderColor='whiteAlpha.200' fontWeight='medium'>
                        <Link href={`/this-month/${row.key}`} style={{ textDecoration: 'underline' }}>
                          {row.label}
                        </Link>
                      </Table.Cell>
                      {months.map((m) => {
                        const cell = row.months[m]
                        return (
                          <Table.Cell key={m} borderColor='whiteAlpha.200' textAlign='right' whiteSpace='nowrap'>
                            {cell ? (
                              <>
                                <Text as='span' color='gray.300' fontSize='xs' mr={1.5}>
                                  +{cell.arrived}/−{cell.departed}
                                </Text>
                                <Text as='span' color={netColor(cell.net)} fontWeight='semibold'>
                                  {cell.net > 0 ? `+${cell.net}` : cell.net}
                                </Text>
                              </>
                            ) : (
                              <Text as='span' color='gray.600'>—</Text>
                            )}
                          </Table.Cell>
                        )
                      })}
                      <Table.Cell borderColor='whiteAlpha.200' textAlign='right' fontWeight='bold' color={netColor(row.totals.net)}>
                        {row.totals.net > 0 ? `+${row.totals.net}` : row.totals.net}
                      </Table.Cell>
                      <Table.Cell borderColor='whiteAlpha.200' textAlign='right' whiteSpace='nowrap'>
                        {sizes[row.key] ? (
                          <Text as='span' color='gray.300'>
                            {(sizes[row.key].m + sizes[row.key].t).toLocaleString('en-US')}
                          </Text>
                        ) : (
                          <Text as='span' color='gray.600'>—</Text>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>

            <Flex wrap='wrap' gap={2} mt={8} align='center'>
              <Text fontSize='sm' color='gray.400'>Drill in:</Text>
              <Button asChild size='xs' {...secondaryButton}>
                <Link href='/leaving'>What&apos;s leaving</Link>
              </Button>
              <Button asChild size='xs' {...secondaryButton}>
                <Link href='/this-month'>This month&apos;s verdicts</Link>
              </Button>
              <Button asChild size='xs' {...secondaryButton}>
                <Link href='/new-on-streaming'>New arrivals</Link>
              </Button>
            </Flex>

            <Text maxW='42rem' mt={8} color='gray.500' fontSize='sm'>
              Counts come from Galaxy Movies&apos; daily snapshots of each service&apos;s tracked US catalog —
              a title counts once when it arrives and once when it departs. Suspected departures are held
              for confirmation before they publish, so single-day catalog glitches don&apos;t show up here.
              Catalog is the provider&apos;s total TMDB-reported US library (movies + TV); live catalogs may
              differ slightly from what each provider advertises.
            </Text>
          </>
        )}
      </PageShell>
    </>
  );
}
